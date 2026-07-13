import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { z } from "zod/v4";
import {
  pool,
  getTenantSmtpSettings,
  isSmtpReady,
  MVP_TENANT_ID,
} from "@workspace/db";
import { supabase } from "../lib/supabase";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  type AuthedRequest,
} from "../lib/auth";
import { OWNER_TENANT_ID } from "../lib/scope";
import { publicAppUrl, sendSmtpMail } from "../lib/mail";
import { buildPasswordResetEmail } from "../lib/email-templates";

const router: IRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z
  .object({
    token: z.string().min(32),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_credentials_format" });
    return;
  }
  const { email, password } = parsed.data;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    req.log.warn({ email, err: error?.message }, "login failed");
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const { rows } = await pool.query<{ tenant_id: string }>(
    "select tenant_id from profiles where id = $1",
    [data.user.id],
  );
  if (rows.length === 0) {
    req.log.error({ userId: data.user.id }, "user has no profile/tenant");
    res.status(403).json({ error: "no_tenant" });
    return;
  }
  const tenantId = rows[0]!.tenant_id;

  const token = createSessionToken({
    userId: data.user.id,
    tenantId,
    email: data.user.email ?? null,
  });
  setSessionCookie(res, token);
  res.json({
    user: { id: data.user.id, email: data.user.email ?? null, tenantId },
  });
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({
    user: {
      ...req.auth,
      isOwner: req.auth!.tenantId === OWNER_TENANT_ID,
    },
  });
});

router.get("/auth/profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.auth!.userId;
  const { rows } = await pool.query<{ email: string | null; created_at: Date }>(
    `select email, created_at from profiles where id = $1`,
    [userId],
  );
  const profile = rows[0];
  const smtp = await getTenantSmtpSettings(pool, MVP_TENANT_ID);
  res.json({
    email: req.auth!.email ?? profile?.email ?? null,
    tenantId: req.auth!.tenantId,
    isOwner: req.auth!.tenantId === OWNER_TENANT_ID,
    memberSince: profile?.created_at
      ? new Date(profile.created_at).toISOString()
      : null,
    smtpConfigured: isSmtpReady(smtp),
  });
});

router.put("/auth/password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    if (issue === "password_mismatch") {
      res.status(400).json({ error: "password_mismatch" });
      return;
    }
    res.status(400).json({ error: "invalid_password" });
    return;
  }

  const email = req.auth!.email;
  if (!email) {
    res.status(400).json({ error: "email_missing" });
    return;
  }

  const check = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (check.error || !check.data.user) {
    res.status(401).json({ error: "invalid_current_password" });
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(req.auth!.userId, {
    password: parsed.data.newPassword,
  });
  if (error) {
    req.log.error({ err: error.message }, "password update failed");
    res.status(500).json({ error: "password_update_failed" });
    return;
  }

  res.json({ ok: true });
});

router.post("/auth/forgot-password", async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_email" });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Always return ok to avoid email enumeration.
  const genericOk = () =>
    res.json({
      ok: true,
      message:
        "Se o e-mail existir, enviamos um link de redefinição (válido por 1 hora).",
    });

  const smtp = await getTenantSmtpSettings(pool, MVP_TENANT_ID);
  if (!isSmtpReady(smtp)) {
    req.log.warn("forgot-password: SMTP not configured");
    genericOk();
    return;
  }

  const { rows } = await pool.query<{ id: string; email: string | null }>(
    `select id, email from profiles where lower(email) = $1 limit 1`,
    [email],
  );
  const profile = rows[0];
  if (!profile) {
    genericOk();
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query(
    `update password_reset_tokens
        set used_at = now()
      where user_id = $1 and used_at is null`,
    [profile.id],
  );
  await pool.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [profile.id, tokenHash, expiresAt],
  );

  const base = publicAppUrl();
  const resetUrl = `${base}/redefinir-senha?token=${rawToken}`;
  const resetEmail = buildPasswordResetEmail({ resetUrl, expiresMinutes: 60 });

  try {
    await sendSmtpMail(smtp!, {
      to: profile.email ?? email,
      subject: resetEmail.subject,
      text: resetEmail.text,
      html: resetEmail.html,
    });
  } catch (e) {
    req.log.error({ err: e }, "forgot-password email failed");
    res.status(502).json({ error: "email_send_failed" });
    return;
  }

  genericOk();
});

router.post("/auth/reset-password", async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    if (issue === "password_mismatch") {
      res.status(400).json({ error: "password_mismatch" });
      return;
    }
    res.status(400).json({ error: "invalid_reset_payload" });
    return;
  }

  const tokenHash = hashToken(parsed.data.token.trim());
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `update password_reset_tokens
        set used_at = now()
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      returning id, user_id`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) {
    res.status(400).json({ error: "invalid_or_expired_token" });
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(row.user_id, {
    password: parsed.data.newPassword,
  });
  if (error) {
    req.log.error({ err: error.message }, "reset password failed");
    res.status(500).json({ error: "password_update_failed" });
    return;
  }

  res.json({ ok: true });
});

export default router;
