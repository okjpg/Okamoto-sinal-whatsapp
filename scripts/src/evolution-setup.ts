/**
 * Cria instância Evolution API e registra webhook apontando para este projeto.
 *
 * Pré-requisitos: Evolution API rodando (docker compose -f docker-compose.evolution.yml up -d)
 *
 *   set -a && source .env && set +a
 *   pnpm --filter @workspace/scripts run evolution-setup
 */

const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE ?? "sinal";
const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL;
const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;

if (!base || !apiKey) {
  throw new Error("EVOLUTION_API_URL and EVOLUTION_API_KEY are required");
}
if (!webhookUrl) {
  throw new Error(
    "EVOLUTION_WEBHOOK_URL is required (ex.: https://SEU-TUNEL.ngrok.io/webhooks/evolution)",
  );
}

const headers = {
  "Content-Type": "application/json",
  apikey: apiKey,
};

async function req(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  return res;
}

async function main(): Promise<void> {
  console.log("1) Criando instância (ignora se já existir)...");
  const create = await req("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
  });
  console.log("   ", create.status, await create.text());

  console.log("\n2) QR Code — escaneie com WhatsApp:");
  console.log(`   ${base}/instance/connect/${instance}`);
  console.log("   (Abra no browser ou: curl -H apikey:... ", base, `/instance/connect/${instance})`);

  console.log("\n3) Registrando webhook...");
  const webhook = await req(`/webhook/set/${instance}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events: ["MESSAGES_UPSERT"],
        headers: webhookSecret
          ? { "x-webhook-secret": webhookSecret }
          : undefined,
      },
    }),
  });
  console.log("   ", webhook.status, await webhook.text());

  console.log("\nPronto. Com webhook + QR conectado, novas mensagens vão para whatsapp_messages.");
  console.log("Depois rode: pnpm --filter @workspace/scripts run refresh-all");
}

void main().catch((e) => {
  console.error("evolution-setup failed:", (e as Error).message);
  process.exit(1);
});
