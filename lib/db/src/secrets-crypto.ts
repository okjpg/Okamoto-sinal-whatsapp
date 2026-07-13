import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
const KDF_SALT = "sinal-openrouter-v1";

function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET is required to encrypt stored credentials.");
  }
  return scryptSync(secret, KDF_SALT, 32);
}

/** AES-256-GCM payload stored in tenant_ai_settings.config.openrouterApiKeyEnc */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
  return `${PREFIX}${payload}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext value — still readable until re-saved from the panel.
    return stored;
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Locate monorepo root (pnpm-workspace.yaml), not artifacts/api-server cwd. */
export function findProjectRoot(start = process.cwd()): string {
  if (process.env.SINAL_PROJECT_ROOT?.trim()) {
    return process.env.SINAL_PROJECT_ROOT.trim();
  }
  let dir = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}
