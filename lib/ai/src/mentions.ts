import { getAiClient, modelForTask } from "./openrouter";

let client: ReturnType<typeof getAiClient> | null = null;
function getClient() {
  if (!client) client = getAiClient();
  return client;
}

export const MENTION_TYPES = [
  "elogio",
  "crítica",
  "objeção",
  "recomendação",
  "lead",
  "indireta",
  "neutra",
] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

export interface MentionInput {
  messageId: string;
  text: string;
}

export interface MentionResult {
  messageId: string;
  isMention: boolean;
  mentionType: MentionType;
  sentiment: "positivo" | "neutro" | "negativo";
}

function systemPrompt(entityName: string, aliases: string[]): string {
  const aliasList =
    aliases.length > 0
      ? ` Aliases conhecidos: ${aliases.join(", ")}. Menções indiretas a esses apelidos também contam.`
      : "";
  return `Você analisa menções a "${entityName}" em mensagens de WhatsApp (grupos e privado). Para CADA mensagem, decida se ela é uma menção GENUÍNA a "${entityName}" (a pessoa/marca), e classifique o tipo.${aliasList}

"is_mention": true se a mensagem fala SOBRE "${entityName}" — inclusive indiretamente (ex.: "o cara do TEDx" quando o alias inclui isso), recomendações, críticas ou perguntas sobre a pessoa/produto. Mensagens dirigidas diretamente a ${entityName} em DM ("oi Bruno") NÃO contam, salvo se também comentam sobre ele para terceiros.

"mention_type" (escolha EXATAMENTE um):
- "elogio": elogio/admiração a ${entityName} ou seu trabalho.
- "crítica": crítica negativa.
- "objeção": dúvida/objeção sobre preço, valor ou produto ("vale a pena?", "é caro").
- "recomendação": alguém recomendando ${entityName} para outra pessoa (venda orgânica).
- "lead": alguém demonstrando interesse em comprar/contratar.
- "indireta": mencionado de passagem, contexto neutro.
- "neutra": menção sem carga clara.

"sentiment": "positivo", "neutro" ou "negativo".
Responda SEMPRE em português.`;
}

function schema() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "mention_batch",
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
                is_mention: { type: "boolean" },
                mention_type: { type: "string", enum: [...MENTION_TYPES] },
                sentiment: {
                  type: "string",
                  enum: ["positivo", "neutro", "negativo"],
                },
              },
              required: [
                "message_id",
                "is_mention",
                "mention_type",
                "sentiment",
              ],
            },
          },
        },
        required: ["results"],
      },
    },
  };
}

/** Classify a batch of candidate messages that contain an entity alias. */
export async function classifyMentions(
  entityName: string,
  inputs: MentionInput[],
  opts?: { aliases?: string[]; batchSize?: number },
): Promise<MentionResult[]> {
  if (inputs.length === 0) return [];
  const aliases = opts?.aliases ?? [entityName];
  const batchSize = opts?.batchSize ?? 12;
  const out: MentionResult[] = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const chunk = inputs.slice(i, i + batchSize);
    const payload = chunk.map((m) => ({
      message_id: m.messageId,
      text: m.text.slice(0, 2000),
    }));
    const completion = await getClient().chat.completions.create({
      model: modelForTask("mentions"),
      temperature: 0,
      response_format: schema(),
      messages: [
        { role: "system", content: systemPrompt(entityName, aliases) },
        {
          role: "user",
          content:
            "Analise cada mensagem abaixo. Um resultado por mensagem, preservando message_id.\n\n" +
            JSON.stringify(payload),
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content)
      throw new Error("Empty completion from OpenAI (classifyMentions).");
    const parsed = JSON.parse(content) as {
      results: {
        message_id: string;
        is_mention: boolean;
        mention_type: MentionType;
        sentiment: "positivo" | "neutro" | "negativo";
      }[];
    };
    out.push(
      ...parsed.results.map((r) => ({
        messageId: r.message_id,
        isMention: r.is_mention,
        mentionType: r.mention_type,
        sentiment: r.sentiment,
      })),
    );
  }
  return out;
}
