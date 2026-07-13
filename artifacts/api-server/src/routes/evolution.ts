import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import {
  extractEvolutionMessages,
  enrichEvolutionMessage,
  type WhatsappMessageInsert,
} from "@workspace/evolution";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { OWNER } from "../lib/scope";
import { scheduleWebhookRefresh } from "../lib/refresh-queue";
import {
  evolutionWebhookUrl,
  fetchConnectionState,
  fetchEvolutionInstances,
  fetchEvolutionQrcode,
  getEvolutionConfig,
  isEvolutionConnected,
  logoutEvolutionInstance,
  prepareInstanceForQr,
  registerEvolutionWebhook,
  resolveInstanceName,
  restartEvolutionInstance,
} from "../lib/evolution-api";
import { getWhatsAppConnectionStatus } from "../lib/whatsapp-connection";
import { recordWebhookHit } from "../lib/webhook-health";

const router: IRouter = Router();

const instanceBodySchema = z.object({
  instanceName: z.string().min(3).max(40).optional(),
  recreate: z.boolean().optional(),
});

function cfgFromRequest(
  req: AuthedRequest,
): ReturnType<typeof getEvolutionConfig> {
  const base = getEvolutionConfig();
  if (!base) return null;
  const parsed = instanceBodySchema.safeParse(req.body ?? {});
  const queryName =
    typeof req.query.instanceName === "string" ? req.query.instanceName : undefined;
  const rawName = parsed.success
    ? (parsed.data.instanceName ?? queryName)
    : queryName;
  if (!rawName) return base;
  try {
    return { ...base, instance: resolveInstanceName(rawName) };
  } catch {
    return null;
  }
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

router.post("/evolution/webhook", async (req, res) => {
  const payloads = extractEvolutionMessages(req.body);
  if (payloads.length === 0) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }

  const instanceFromBody =
    typeof req.body === "object" && req.body && "instance" in req.body
      ? String((req.body as { instance?: string }).instance ?? "").trim()
      : "";
  const cfg = getEvolutionConfig(instanceFromBody || undefined);
  if (!cfg || !OWNER) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  let inserted = 0;
  for (const p of payloads) {
    const row = await enrichEvolutionMessage(p, OWNER, cfg.instance, cfg);
    if (!row) continue;
    if (await insertMessage(row)) inserted++;
  }

  res.json({ ok: true, received: payloads.length, inserted });
  recordWebhookHit();
  if (inserted > 0) scheduleWebhookRefresh();
});

router.use(requireAuth);

router.get("/evolution/status", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  const status = await getWhatsAppConnectionStatus(cfg);
  res.json(status);
});

router.get("/evolution/instances", async (req: AuthedRequest, res) => {
  const cfg = getEvolutionConfig();
  if (!cfg) {
    res.status(503).json({ error: "evolution_not_configured" });
    return;
  }
  const instances = await fetchEvolutionInstances(cfg);
  res.json({ instances });
});

router.post("/evolution/instance", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  if (!cfg) {
    res.status(400).json({ error: "invalid_instance_name" });
    return;
  }

  const recreate = Boolean(
    instanceBodySchema.safeParse(req.body ?? {}).data?.recreate,
  );

  try {
    const prep = await prepareInstanceForQr(cfg, { recreate, ownerPhone: OWNER });
    const state = await fetchConnectionState(cfg);
    res.json({
      ok: true,
      instance: cfg.instance,
      state,
      created: prep.created,
      alreadyExists: prep.alreadyExists,
      message: prep.message,
      base64: null,
      pairingCode: null,
    });
  } catch (e) {
    req.log?.error({ err: e }, "evolution create instance failed");
    res.status(502).json({ error: "evolution_create_failed" });
  }
});

router.post("/evolution/connect", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  if (!cfg) {
    res.status(400).json({ error: "invalid_instance_name" });
    return;
  }

  const parsed = instanceBodySchema.safeParse(req.body ?? {});
  const recreate = parsed.success ? Boolean(parsed.data.recreate) : false;

  try {
    let state = await fetchConnectionState(cfg);
    if (isEvolutionConnected(state)) {
      const hookUrl = evolutionWebhookUrl();
      let webhookRegistered = false;
      if (hookUrl) {
        try {
          await registerEvolutionWebhook(cfg, hookUrl);
          webhookRegistered = true;
        } catch (e) {
          req.log?.warn({ err: e }, "evolution webhook registration failed");
        }
      }
      res.json({
        base64: null,
        pairingCode: null,
        state,
        instance: cfg.instance,
        webhookRegistered,
        webhookConfigured: Boolean(hookUrl),
        alreadyConnected: true,
        message: "WhatsApp já está conectado.",
      });
      return;
    }

    const prep = await prepareInstanceForQr(cfg, { recreate, ownerPhone: OWNER });

    const hookUrl = evolutionWebhookUrl();
    let webhookRegistered = false;
    if (hookUrl) {
      try {
        await registerEvolutionWebhook(cfg, hookUrl);
        webhookRegistered = true;
      } catch (e) {
        req.log?.warn({ err: e }, "evolution webhook registration failed");
      }
    }

    const { base64, pairingCode } = await fetchEvolutionQrcode(cfg, OWNER);
    state = await fetchConnectionState(cfg);

    res.json({
      base64,
      pairingCode,
      state,
      instance: cfg.instance,
      webhookRegistered,
      webhookConfigured: Boolean(hookUrl),
      created: prep.created,
      alreadyExists: prep.alreadyExists,
      message: prep.message,
    });
  } catch (e) {
    req.log?.error({ err: e }, "evolution connect failed");
    res.status(502).json({ error: "evolution_connect_failed" });
  }
});

router.get("/evolution/qrcode", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  if (!cfg) {
    res.status(400).json({ error: "invalid_instance_name" });
    return;
  }
  try {
    const state = await fetchConnectionState(cfg);
    if (isEvolutionConnected(state)) {
      res.json({
        base64: null,
        pairingCode: null,
        state,
        instance: cfg.instance,
        alreadyConnected: true,
      });
      return;
    }
    if (state === "connecting") {
      await restartEvolutionInstance(cfg);
    }
    const { base64, pairingCode } = await fetchEvolutionQrcode(cfg, OWNER);
    const newState = await fetchConnectionState(cfg);
    res.json({
      base64,
      pairingCode,
      state: newState,
      instance: cfg.instance,
    });
  } catch (e) {
    req.log?.error({ err: e }, "evolution qrcode failed");
    res.status(502).json({ error: "evolution_qrcode_failed" });
  }
});

router.post("/evolution/restart", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  if (!cfg) {
    res.status(400).json({ error: "invalid_instance_name" });
    return;
  }
  try {
    await restartEvolutionInstance(cfg);
    const state = await fetchConnectionState(cfg);
    res.json({ ok: true, state, instance: cfg.instance });
  } catch (e) {
    req.log?.error({ err: e }, "evolution restart failed");
    res.status(502).json({ error: "evolution_restart_failed" });
  }
});

router.post("/evolution/disconnect", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  if (!cfg) {
    res.status(400).json({ error: "invalid_instance_name" });
    return;
  }
  try {
    await logoutEvolutionInstance(cfg);
    res.json({ ok: true });
  } catch (e) {
    req.log?.error({ err: e }, "evolution disconnect failed");
    res.status(502).json({ error: "evolution_disconnect_failed" });
  }
});

router.post("/evolution/webhook/register", async (req: AuthedRequest, res) => {
  const cfg = cfgFromRequest(req);
  if (!cfg) {
    res.status(400).json({ error: "invalid_instance_name" });
    return;
  }
  const hookUrl = evolutionWebhookUrl();
  if (!hookUrl) {
    res.status(400).json({
      error: "webhook_not_configured",
      message: "Configure EVOLUTION_WEBHOOK_URL ou SINAL_PUBLIC_URL no .env",
    });
    return;
  }
  try {
    await registerEvolutionWebhook(cfg, hookUrl);
    const status = await getWhatsAppConnectionStatus(cfg);
    res.json({
      ok: true,
      webhookUrl: hookUrl,
      webhookRegistered: status.webhookRegistered,
    });
  } catch (e) {
    req.log?.error({ err: e }, "evolution webhook register failed");
    res.status(502).json({ error: "evolution_webhook_register_failed" });
  }
});

export default router;
