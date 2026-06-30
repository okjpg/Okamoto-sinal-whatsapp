import { getAiClient, modelForTask } from "./openrouter";

let client: ReturnType<typeof getAiClient> | null = null;
function getClient() {
  if (!client) client = getAiClient();
  return client;
}

export interface ContactAnalysisMessage {
  direction: string;
  text: string;
  at?: string | null;
}

export interface ContactAnalysisInput {
  contactName: string | null;
  totalMessages: number;
  sent: number;
  received: number;
  messages: ContactAnalysisMessage[];
}

const SYSTEM = `Você é um analista de relacionamento que estuda o histórico de conversas de WhatsApp de um empreendedor/criador brasileiro (Bruno) com um contato específico. Produza uma "fotografia" objetiva da relação, em português do Brasil, para ajudar o Bruno a entender rapidamente quem é esse contato e em que pé está a conversa.

Escreva um texto corrido e curto (3 a 5 parágrafos no máximo, ou alguns bullets quando fizer sentido), cobrindo:
- Quem parece ser o contato e a natureza da relação (cliente, parceiro, fã, fornecedor, pessoal etc.), inferida pelo conteúdo.
- Os principais assuntos/pautas recorrentes da conversa.
- O tom geral e o nível de engajamento de cada lado (quem puxa mais a conversa, tempo de resposta aparente).
- Pendências em aberto ou próximos passos sugeridos, se houver sinais disso.

Regras:
- Baseie-se APENAS nas mensagens fornecidas. Não invente fatos, nomes, datas ou números que não estejam no histórico.
- Seja específico e acionável; evite generalidades vazias.
- Não use emojis. Responda SEMPRE em português do Brasil.`;

/**
 * Generate an on-demand pt-BR relationship overview for a single contact from a
 * sample of their messages. Plain-text completion (no JSON schema). Throws on
 * API/empty error so the caller can surface a failure.
 */
export async function analyzeContact(
  input: ContactAnalysisInput,
): Promise<string> {
  const transcript = input.messages
    .map((m) => {
      const who = m.direction === "outbound" ? "Bruno" : "Contato";
      return `${who}: ${m.text.replace(/\s+/g, " ").slice(0, 600)}`;
    })
    .join("\n");

  const header = `Contato: ${input.contactName ?? "desconhecido"}\nTotal de mensagens: ${input.totalMessages} (enviadas por Bruno: ${input.sent}, recebidas: ${input.received}).\n\nAmostra do histórico (ordem cronológica):`;

  const completion = await getClient().chat.completions.create({
    model: modelForTask("contact_analysis"),
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${header}\n${transcript}` },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error("Empty completion from OpenAI (analyzeContact).");
  }
  return content.trim();
}
