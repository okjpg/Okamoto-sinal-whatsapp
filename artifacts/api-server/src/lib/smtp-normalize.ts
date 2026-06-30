/** Strip quotes from values pasted from .env / Laravel MAIL_* blocks. */
export function sanitizeEnvLikeString(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  let s = value.trim();
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Gmail: 587 = STARTTLS (secure false), 465 = implicit TLS (secure true). */
export function resolveSmtpSecure(port: number, secure?: boolean): boolean {
  if (port === 465) return true;
  if (port === 587 || port === 25 || port === 2525) return false;
  return secure ?? false;
}

export function readMailEncryptionSecure(): boolean | undefined {
  const enc =
    process.env.MAIL_ENCRYPTION?.trim().toLowerCase() ??
    process.env.SMTP_ENCRYPTION?.trim().toLowerCase();
  if (!enc) return undefined;
  if (enc === "ssl" || enc === "smtps") return true;
  if (enc === "tls" || enc === "starttls") return false;
  return undefined;
}
