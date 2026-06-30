import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findProjectRoot } from "@workspace/db";

export { maskSecret } from "@workspace/db";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export function projectRoot(): string {
  return findProjectRoot();
}

export function envFilePath(): string {
  return path.join(projectRoot(), ".env");
}

function escapeEnvValue(value: string): string {
  if (/[\s#"'\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** Upsert keys in the workspace `.env` without touching other variables. */
export function upsertEnvVars(vars: Record<string, string>): string {
  const file = envFilePath();
  let lines: string[] = [];
  try {
    lines = readFileSync(file, "utf8").split("\n");
  } catch {
    lines = [];
  }

  for (const [key, value] of Object.entries(vars)) {
    const prefix = `${key}=`;
    const newLine = `${key}=${escapeEnvValue(value)}`;
    const idx = lines.findIndex(
      (line) => line.startsWith(prefix) && !line.trimStart().startsWith("#"),
    );
    if (idx >= 0) lines[idx] = newLine;
    else {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      lines.push(newLine);
    }
  }

  const out = lines.join("\n");
  const normalized = out.endsWith("\n") ? out : `${out}\n`;
  writeFileSync(file, normalized, "utf8");
  return file;
}
