import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pool } from "@workspace/db";
import {
  extractEvolutionMessages,
  enrichEvolutionMessage,
  getEvolutionApiConfigFromEnv,
  type WhatsappMessageInsert,
} from "@workspace/evolution";

const port = Number(process.env.EVOLUTION_WEBHOOK_PORT ?? "9090");
const owner = process.env.WHATSAPP_OWNER;
const instance = process.env.EVOLUTION_INSTANCE ?? "sinal";
const secret = process.env.EVOLUTION_WEBHOOK_SECRET;

if (!owner) {
  throw new Error("WHATSAPP_OWNER is required");
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function insertMessage(row: WhatsappMessageInsert): Promise<boolean> {
  const r = await pool.query(
    `insert into whatsapp_messages (
       whatsapp_owner, chat_type, chat_id, chat_name, contact_phone,
       sender_phone, sender_name, recipient_phone, direction,
       message_type, message, caption, media_url, media_mime_type,
       message_id, reply_to_message_id, forwarded, status,
       message_created_at, metadata
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
     )
     on conflict (message_id) do nothing
     returning message_id`,
    [
      row.whatsapp_owner,
      row.chat_type,
      row.chat_id,
      row.chat_name,
      row.contact_phone,
      row.sender_phone,
      row.sender_name,
      row.recipient_phone,
      row.direction,
      row.message_type,
      row.message,
      row.caption,
      row.media_url,
      row.media_mime_type,
      row.message_id,
      row.reply_to_message_id,
      row.forwarded,
      row.status,
      row.message_created_at,
      JSON.stringify(row.metadata),
    ],
  );
  return r.rowCount === 1;
}

async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405).end("Method not allowed");
    return;
  }

  if (secret) {
    const got = req.headers["x-webhook-secret"] ?? req.headers["apikey"];
    if (got !== secret) {
      res.writeHead(401).end("Unauthorized");
      return;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400).end("Invalid JSON");
    return;
  }

  const payloads = extractEvolutionMessages(parsed);
  const cfg = getEvolutionApiConfigFromEnv(instance);
  let inserted = 0;
  for (const p of payloads) {
    const row = await enrichEvolutionMessage(p, owner, instance, cfg);
    if (!row) continue;
    if (await insertMessage(row)) inserted++;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, received: payloads.length, inserted }));
}

const server = createServer((req, res) => {
  const path = req.url?.split("?")[0];
  if (path === "/webhooks/evolution" || path === "/") {
    void handleWebhook(req, res).catch((e) => {
      console.error("webhook error:", (e as Error).message);
      res.writeHead(500).end("Internal error");
    });
    return;
  }
  if (path === "/healthz") {
    res.writeHead(200).end("ok");
    return;
  }
  res.writeHead(404).end("Not found");
});

server.listen(port, () => {
  console.log(`Evolution webhook listening on http://0.0.0.0:${port}/webhooks/evolution`);
  console.log(`Instance: ${instance} | Owner: ${owner}`);
});

process.on("SIGINT", () => {
  void pool.end().finally(() => process.exit(0));
});
