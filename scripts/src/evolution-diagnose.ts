/**
 * Diagnóstico Evolution API — não imprime segredos.
 * Uso: set -a && source .env && set +a && pnpm exec tsx scripts/src/evolution-diagnose.ts
 */

const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE ?? "sinal";

if (!base || !apiKey) {
  console.error("EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórios");
  process.exit(1);
}

const headers = { apikey: apiKey, "Content-Type": "application/json" };

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: json };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: json };
}

function summarizeInstances(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const arr = Array.isArray(body)
    ? body
    : Array.isArray((body as { instances?: unknown[] }).instances)
      ? (body as { instances: unknown[] }).instances
      : Array.isArray((body as { response?: unknown[] }).response)
        ? (body as { response: unknown[] }).response
        : [];
  return arr.map((row) => {
    if (!row || typeof row !== "object") return String(row);
    const r = row as Record<string, unknown>;
    const name =
      r.instanceName ??
      r.name ??
      (r.instance as Record<string, unknown> | undefined)?.instanceName;
    const state =
      r.status ??
      r.state ??
      (r.instance as Record<string, unknown> | undefined)?.status;
    return `${String(name ?? "?")} (${String(state ?? "?")})`;
  });
}

async function main() {
  console.log("Evolution base:", base);
  console.log("Instância alvo (.env):", instance);
  console.log();

  const paths = [
    "/",
    "/instance/fetchInstances",
    `/instance/connectionState/${instance}`,
    `/instance/connect/${instance}`,
  ];

  for (const path of paths) {
    const r = await get(path);
    console.log(`GET ${path} → ${r.status}`);
    if (path.includes("fetchInstances")) {
      const names = summarizeInstances(r.body);
      console.log("  instâncias:", names.length ? names.join(", ") : "(nenhuma ou formato desconhecido)");
      if (names.length === 0 && r.body) {
        console.log("  raw keys:", typeof r.body === "object" && r.body ? Object.keys(r.body as object) : typeof r.body);
      }
    } else if (path.includes("connect")) {
      const b = r.body as Record<string, unknown> | string;
      if (typeof b === "object" && b) {
        const qr = b.qrcode as Record<string, unknown> | undefined;
        console.log("  has base64:", Boolean(b.base64 || qr?.base64));
        console.log("  pairingCode:", b.pairingCode ?? qr?.pairingCode ?? "-");
      }
    } else if (path.includes("connectionState")) {
      console.log("  body:", JSON.stringify(r.body).slice(0, 300));
    } else {
      console.log("  body:", JSON.stringify(r.body).slice(0, 200));
    }
    console.log();
  }

  console.log("Tentando POST /instance/create ...");
  const created = await post("/instance/create", {
    instanceName: instance,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
  });
  console.log(`  status: ${created.status}`);
  console.log("  body:", JSON.stringify(created.body).slice(0, 400));
  console.log();

  const list = await get("/instance/fetchInstances");
  const names = summarizeInstances(list.body);
  console.log("Após create — instâncias:", names.length ? names.join(", ") : "(nenhuma)");
}

void main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
