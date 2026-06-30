import nodemailer from "nodemailer";
import type { TenantSmtpSettings } from "@workspace/db";

export async function sendSmtpMail(
  settings: TenantSmtpSettings,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user
      ? { user: settings.user, pass: settings.password }
      : undefined,
  });

  await transporter.sendMail({
    from: settings.fromName
      ? `"${settings.fromName}" <${settings.fromEmail}>`
      : settings.fromEmail,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? opts.text.replace(/\n/g, "<br>"),
  });
}

export async function verifySmtpConnection(
  settings: TenantSmtpSettings,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user
      ? { user: settings.user, pass: settings.password }
      : undefined,
  });
  await transporter.verify();
}

export function publicAppUrl(): string {
  const explicit = process.env.SINAL_PUBLIC_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  const port = process.env.WEB_PORT ?? process.env.VITE_PORT ?? "5177";
  return `http://localhost:${port}`;
}
