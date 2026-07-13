import { CATEGORIES, SENTIMENTS, type Category, type Sentiment } from "./taxonomy";
import { getAiClient, modelForTask, useOpenRouterForTask } from "./openrouter";

export interface ClassifyInput {
  messageId: string;
  text: string;
  chatType?: string | null;
}

export interface Classification {
  messageId: string;
  category: Category;
  sentiment: Sentiment;
  topics: string[];
  isQuestion: boolean;
  requiresReply: boolean;
  summary: string;
}

// Default OpenAI model. Also used by cluster.ts / mentions.ts (small sample jobs).
export const CLASSIFY_MODEL = "gpt-4.1-mini";

// Default OpenRouter model for the cheap full backfill (DeepSeek V3, pinned).
export const OPENROUTER_CLASSIFY_MODEL = "deepseek/deepseek-chat-v3-0324";

type Provider = "openai" | "openrouter";

/** Active model name (env override wins, else provider default). */
export function activeClassifyModel(): string {
  return modelForTask("classify");
}

/** Active provider for classifyBatch, selected via CLASSIFY_PROVIDER env. */
export function activeProvider(): Provider {
  return useOpenRouterForTask() ? "openrouter" : "openai";
}

const SYSTEM_PROMPT = `Você é um classificador de mensagens de WhatsApp de um empreendedor/criador brasileiro (Bruno). Para CADA mensagem recebida, retorne uma classificação estruturada.

Categorias permitidas (use EXATAMENTE uma destas strings):
- "suporte/dúvida": pedidos de ajuda, dúvidas técnicas ou sobre produtos.
- "oportunidade/parceria": propostas de parceria, colaboração, negócios.
- "convite": convites para podcast, palestra, entrevista, imprensa, evento.
- "fã/feedback": elogios, feedback de fãs, agradecimentos.
- "networking": apresentações, conexões, "vamos nos conhecer".
- "cold outreach/venda": abordagens frias, vendas, propostas comerciais não solicitadas.
- "financeiro/fornecedor": pagamentos, cobranças, fornecedores, notas fiscais.
- "interno/equipe": comunicação com equipe/colaboradores internos.
- "pessoal/família": família, amigos, assuntos pessoais.
- "outro": não se encaixa em nenhuma acima.

Sentimento (use EXATAMENTE uma): "positivo", "neutro", "negativo".

Regras:
- "topics": 1 a 3 temas curtos e específicos em português (ex: "agendamento de podcast", "dúvida sobre curso"). Evite genéricos vagos.
- "is_question": true se a mensagem contém uma pergunta direta.
- "requires_reply": true se exige uma resposta/ação de Bruno.
- "summary": resumo de 1 frase curta em português.
- Responda SEMPRE em português. Não invente conteúdo além do texto.`;

// For providers without strict json_schema support (OpenRouter/DeepSeek): spell
// out the exact JSON object shape. response_format json_object guarantees valid
// JSON but not the schema, so we describe it precisely here.
const JSON_SHAPE_INSTRUCTION = `Responda APENAS com um objeto JSON válido (sem markdown, sem comentários) exatamente neste formato:
{"results":[{"message_id":"<id original>","category":"<uma das categorias>","sentiment":"positivo|neutro|negativo","topics":["tema1"],"is_question":true,"requires_reply":false,"summary":"..."}]}
Inclua um item em "results" para CADA mensagem recebida, preservando o message_id exatamente como veio.`;

function stripCodeFences(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    return t
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return t;
}

function buildSchema() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "classification_batch",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                message_id: { type: "string" },
                category: { type: "string", enum: [...CATEGORIES] },
                sentiment: { type: "string", enum: [...SENTIMENTS] },
                topics: {
                  type: "array",
                  items: { type: "string" },
                },
                is_question: { type: "boolean" },
                requires_reply: { type: "boolean" },
                summary: { type: "string" },
              },
              required: [
                "message_id",
                "category",
                "sentiment",
                "topics",
                "is_question",
                "requires_reply",
                "summary",
              ],
            },
          },
        },
        required: ["results"],
      },
    },
  };
}

interface RawResult {
  message_id: string;
  category: Category;
  sentiment: Sentiment;
  topics: string[];
  is_question: boolean;
  requires_reply: boolean;
  summary: string;
}

/**
 * Classify a batch of messages (recommended 15-25 per call). Returns one
 * Classification per input message that the model returned. Throws on API or
 * parse error so callers can decide retry/skip behavior.
 */
export async function classifyBatch(
  inputs: ClassifyInput[],
): Promise<Classification[]> {
  if (inputs.length === 0) return [];

  const userPayload = inputs.map((m) => ({
    message_id: m.messageId,
    chat_type: m.chatType ?? "private",
    text: m.text.slice(0, 4000),
  }));

  const provider = activeProvider();
  const model = activeClassifyModel();

  // OpenAI supports strict json_schema; OpenRouter models (DeepSeek/Qwen) use
  // the broadly-supported json_object mode plus an explicit shape in the prompt.
  const useStrictSchema = provider === "openai";
  const systemPrompt = useStrictSchema
    ? SYSTEM_PROMPT
    : SYSTEM_PROMPT + "\n\n" + JSON_SHAPE_INSTRUCTION;

  const completion = await getAiClient().chat.completions.create({
    model,
    temperature: 0,
    response_format: useStrictSchema
      ? buildSchema()
      : { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Classifique cada mensagem do array a seguir. Retorne um resultado por mensagem, preservando o message_id.\n\n" +
          JSON.stringify(userPayload),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Empty completion from model.");

  const parsed = JSON.parse(stripCodeFences(content)) as { results?: RawResult[] };
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const validIds = new Set(inputs.map((m) => m.messageId));
  const categorySet = new Set<string>(CATEGORIES);
  const sentimentSet = new Set<string>(SENTIMENTS);

  return results
    .filter((r) => r && typeof r.message_id === "string" && validIds.has(r.message_id))
    .map((r) => ({
      messageId: r.message_id,
      category: categorySet.has(r.category) ? r.category : ("outro" as Category),
      sentiment: sentimentSet.has(r.sentiment)
        ? r.sentiment
        : ("neutro" as Sentiment),
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 3).map(String) : [],
      isQuestion: Boolean(r.is_question),
      requiresReply: Boolean(r.requires_reply),
      summary: typeof r.summary === "string" ? r.summary : "",
    }));
}
