import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DB_URL (or DATABASE_URL) must be set. Did you forget to configure the Supabase connection?",
  );
}

const isSupabase = /supabase\.(co|com)/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./refresh";
export * from "./pipeline";
export * from "./ai-settings";
export * from "./secrets-crypto";
export * from "./monitored-entity";
export * from "./smtp-settings";
