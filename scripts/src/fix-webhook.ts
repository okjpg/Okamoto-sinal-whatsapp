/**
 * Sobe ngrok (8787), registra webhook na Evolution e testa reachability.
 */
import { pool } from "@workspace/db";
import { registerEvolutionWebhook, getEvolutionConfig } from "../../artifacts/api-server/src/lib/evolution-api";

async function waitNgrokUrl(maxMs = 20000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch("http://127.0.0.1:4040/api/tunnels");
      const data = (await r.json()) as {
        tunnels?: { public_url?: string; proto?: string }[];
      };
      const https = data.tunnels?.find((t) => t.public_url?.startsWith("https://"));
      if (https?.public_url) return https.public_url.replace(/\/$/, "");
    } catch {
      /* ngrok ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("ngrok não respondeu em 127.0.0.1:4040 — rode: ngrok http 8787");
}

async function main(): Promise<void> {
  const cfg = getEvolutionConfig();
  if (!cfg) throw new Error("Evolution não configurado no .env");

  let publicBase: string | null = null;
  try {
    publicBase = await waitNgrokUrl(5000);
    console.log("ngrok ativo:", publicBase);
  } catch {
    const fromEnv = process.env.EVOLUTION_WEBHOOK_URL?.trim();
    if (fromEnv) {
      publicBase = fromEnv.replace(/\/api\/evolution\/webhook\/?$/, "");
      console.log("ngrok local indisponível — usando .env:", publicBase);
    }
  }

  if (!publicBase) {
    throw new Error("Sem ngrok e sem EVOLUTION_WEBHOOK_URL — impossível registrar webhook");
  }

  const webhookUrl = `${publicBase}/api/evolution/webhook`;
  const healthUrl = `${publicBase}/api/healthz`;

  const health = await fetch(healthUrl).catch(() => null);
  const healthOk = health?.ok ?? false;
  console.log("Webhook URL:", webhookUrl);
  console.log("Health check:", healthOk ? "OK" : `FALHOU (${health?.status ?? "sem resposta"})`);

  if (!healthOk) {
    console.error(
      "\nO túnel não alcança a API. Confirme: pnpm dev rodando e ngrok apontando para porta 8787.",
    );
    console.error("Rode: ngrok http 8787   ou   bash scripts/start-all.sh");
    process.exit(1);
  }

  await registerEvolutionWebhook(cfg, webhookUrl);
  console.log("✓ Webhook registrado na Evolution para instância:", cfg.instance);
  console.log("\nAtualize o .env se a URL ngrok mudou:");
  console.log(`EVOLUTION_WEBHOOK_URL=${webhookUrl}`);
  await pool.end();
}

void main().catch((e) => {
  console.error("fix-webhook failed:", (e as Error).message);
  process.exit(1);
});
