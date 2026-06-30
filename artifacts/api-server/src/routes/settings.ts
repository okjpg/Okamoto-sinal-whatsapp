import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  pool,
  getTenantSmtpSettings,
  saveTenantSmtpSettings,
  hasStoredSmtpSettings,
  maskSmtpUser,
  isSmtpReady,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { requireOwnerTenant } from "../lib/scope";
import { upsertEnvVars, envFilePath } from "../lib/env-file";
import { sendSmtpMail, verifySmtpConnection } from "../lib/mail";
import { buildSmtpTestEmail } from "../lib/email-templates";
import {
  resolveSmtpSecure,
  sanitizeEnvLikeString,
} from "../lib/smtp-normalize";

const router: IRouter = Router();
router.use(requireAuth);
router.use(requireOwnerTenant);

router.get("/settings/smtp", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  const settings = await getTenantSmtpSettings(pool, tenantId);
  const storedInDb = await hasStoredSmtpSettings(pool, tenantId);
  res.json({
    configured: isSmtpReady(settings),
    storedInDb,
    envFilePath: envFilePath(),
    host: settings?.host ?? null,
    port: settings?.port ?? 587,
    secure: settings?.secure ?? false,
    user: settings?.user ?? null,
    userMasked: maskSmtpUser(settings?.user),
    fromEmail: settings?.fromEmail ?? null,
    fromName: settings?.fromName ?? "Sinal",
  });
});

const smtpSchema = z.object({
  host: z.preprocess(
    (v) => (typeof v === "string" ? sanitizeEnvLikeString(v) : v),
    z.string().min(3),
  ),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.preprocess(
    (v) => (typeof v === "string" ? sanitizeEnvLikeString(v) : v),
    z.string().optional(),
  ),
  password: z.preprocess(
    (v) => (typeof v === "string" ? sanitizeEnvLikeString(v) : v),
    z.string().min(1).optional(),
  ),
  fromEmail: z.preprocess(
    (v) => (typeof v === "string" ? sanitizeEnvLikeString(v) : v),
    z.string().email(),
  ),
  fromName: z.preprocess(
    (v) => (typeof v === "string" ? sanitizeEnvLikeString(v) : v),
    z.string().min(1).optional(),
  ),
});

router.put("/settings/smtp", async (req: AuthedRequest, res) => {
  const parsed = smtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_smtp_settings",
      message:
        "Verifique host, e-mail remetente e senha. Remova aspas se colou do .env (ex: smtp.gmail.com, não \"smtp.gmail.com\").",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const body = parsed.data;
  const host = sanitizeEnvLikeString(body.host) ?? "";
  const fromEmail = sanitizeEnvLikeString(body.fromEmail) ?? "";
  const user = sanitizeEnvLikeString(body.user) ?? "";
  const port = body.port ?? 587;
  const secure = resolveSmtpSecure(port, body.secure);

  if (!host || !fromEmail) {
    res.status(400).json({
      error: "invalid_smtp_settings",
      message: "Host e e-mail remetente são obrigatórios.",
    });
    return;
  }

  const existing = await getTenantSmtpSettings(pool, req.auth!.tenantId);
  const password =
    sanitizeEnvLikeString(body.password) || existing?.password;
  if (!password) {
    res.status(400).json({
      error: "smtp_password_required",
      message: "Informe a senha SMTP (senha de app do Gmail).",
    });
    return;
  }

  let saved;
  try {
    saved = await saveTenantSmtpSettings(pool, req.auth!.tenantId, {
      host,
      port,
      secure,
      user: user || existing?.user || "",
      password,
      fromEmail,
      fromName:
        sanitizeEnvLikeString(body.fromName) ||
        existing?.fromName ||
        "Sinal",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "invalid_smtp_settings") {
      res.status(400).json({ error: msg });
      return;
    }
    if (msg.includes("SESSION_SECRET")) {
      res.status(500).json({ error: "session_secret_required" });
      return;
    }
    throw e;
  }

  let envPath: string | null = null;
  try {
    envPath = upsertEnvVars({
      SMTP_HOST: saved.host,
      SMTP_PORT: String(saved.port),
      SMTP_SECURE: saved.secure ? "true" : "false",
      SMTP_USER: saved.user,
      SMTP_PASS: saved.password,
      SMTP_FROM: saved.fromEmail,
      SMTP_FROM_NAME: saved.fromName,
    });
  } catch (e) {
    req.log.error({ err: e }, "failed to write .env for smtp");
    res.status(500).json({
      error: "env_write_failed",
      message: "SMTP salvo no banco, mas falhou ao atualizar o .env.",
      storedInDb: true,
    });
    return;
  }

  res.json({
    ok: true,
    configured: true,
    storedInDb: true,
    envUpdated: true,
    envFilePath: envPath,
    userMasked: maskSmtpUser(saved.user),
    user: saved.user,
    fromEmail: saved.fromEmail,
    fromName: saved.fromName,
  });
});

const testSchema = z.object({
  to: z.string().email().optional(),
  host: z.string().min(3).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().min(1).optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
});

router.post("/settings/smtp/test", async (req: AuthedRequest, res) => {
  const parsed = testSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_test_payload" });
    return;
  }

  const stored = await getTenantSmtpSettings(pool, req.auth!.tenantId);
  const body = parsed.data;
  const draftHost = sanitizeEnvLikeString(body.host);
  const draftPass = sanitizeEnvLikeString(body.password);
  const draftFrom = sanitizeEnvLikeString(body.fromEmail);
  const draftPort = body.port ?? stored?.port ?? 587;
  const settings =
    draftHost && draftPass && draftFrom
      ? {
          host: draftHost,
          port: draftPort,
          secure: resolveSmtpSecure(draftPort, body.secure ?? stored?.secure),
          user: sanitizeEnvLikeString(body.user) ?? stored?.user ?? "",
          password: draftPass,
          fromEmail: draftFrom,
          fromName:
            sanitizeEnvLikeString(body.fromName) ||
            stored?.fromName ||
            "Sinal",
        }
      : stored;

  if (!isSmtpReady(settings)) {
    res.status(503).json({ error: "smtp_not_configured" });
    return;
  }

  const to = body.to?.trim() || req.auth!.email;
  if (!to) {
    res.status(400).json({ error: "test_recipient_required" });
    return;
  }

  try {
    await verifySmtpConnection(settings!);
    const testEmail = buildSmtpTestEmail({ recipientEmail: to });
    await sendSmtpMail(settings!, {
      to,
      subject: testEmail.subject,
      text: testEmail.text,
      html: testEmail.html,
    });
    res.json({ ok: true, to });
  } catch (e) {
    req.log.warn({ err: e }, "smtp test failed");
    res.status(502).json({
      ok: false,
      error: "smtp_test_failed",
      message: (e as Error).message,
    });
  }
});

export default router;
