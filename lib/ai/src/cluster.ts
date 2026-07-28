import OpenAI from "openai";
import { CLASSIFY_MODEL } from "./classify";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface TopicCluster {
  label: string;
  summary: string;
  members: string[];
}

const SYSTEM = `Você agrupa "pautas" (temas) de conversas de WhatsApp de um empreendedor/criador brasileiro. Recebe uma lista de frases-tema cruas (já extraídas de mensagens) e deve agrupá-las em pautas canônicas, específicas e acionáveis — NÃO buckets genéricos vagos.

Regras:
- Cada pauta canônica tem: "label" (3-6 palavras, específico, em português), "summary" (1 frase curta explicando o tema) e "members" (as frases cruas EXATAS da entrada que pertencem a essa pauta).
- Agrupe frases que são variações do mesmo tema. Use apenas frases que vieram na entrada (cópia exata) em "members".
- Produza entre 5 e 15 pautas. Toda frase relevante deve estar em no máximo uma pauta. Ignore frases vazias ou sem sentido.
- Responda SEMPRE em português.`;

function schema() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "topic_clusters",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          clusters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                summary: { type: "string" },
                members: { type: "array", items: { type: "string" } },
              },
              required: ["label", "summary", "members"],
            },
          },
        },
        required: ["clusters"],
      },
    },
  };
}

const CHUNK_SIZE = 150;

async function clusterChunk(phrases: string[]): Promise<TopicCluster[]> {
  const completion = await getClient().chat.completions.create({
    model: CLASSIFY_MODEL,
    temperature: 0,
    response_format: schema(),
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          "Agrupe as seguintes frases-tema em pautas canônicas:\n\n" +
          JSON.stringify(phrases),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Empty completion from OpenAI (clusterTopics).");
  const parsed = JSON.parse(content) as { clusters: TopicCluster[] };
  return parsed.clusters ?? [];
}

/** Cluster raw topic phrases into canonical named pautas. */
export async function clusterTopics(
  rawPhrases: string[],
): Promise<TopicCluster[]> {
  if (rawPhrases.length === 0) return [];

  // If small enough, cluster in one call
  if (rawPhrases.length <= CHUNK_SIZE) {
    return clusterChunk(rawPhrases);
  }

  // Split into chunks, cluster each, then merge overlapping labels
  const allClusters: TopicCluster[] = [];
  for (let i = 0; i < rawPhrases.length; i += CHUNK_SIZE) {
    const chunk = rawPhrases.slice(i, i + CHUNK_SIZE);
    const clusters = await clusterChunk(chunk);
    allClusters.push(...clusters);
  }

  // Merge clusters with similar labels (case-insensitive)
  const merged = new Map<string, TopicCluster>();
  for (const c of allClusters) {
    const key = c.label.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.members.push(...c.members);
      // Keep the longer summary
      if (c.summary.length > existing.summary.length) {
        existing.summary = c.summary;
      }
    } else {
      merged.set(key, { ...c, members: [...c.members] });
    }
  }
  return [...merged.values()];
}
