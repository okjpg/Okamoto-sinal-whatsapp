import { pool } from "@workspace/db";
import { classifyBatch, activeClassifyModel, type ClassifyInput } from "@workspace/ai";

// Phase 4 — FULL text backfill. Classifies every un-enriched text-bearing message
// from the read-only whatsapp_messages table into message_enrichment, using the
// active provider (set CLASSIFY_PROVIDER=openrouter for the cheap DeepSeek run).
//
// Resumable + idempotent: each page re-queries for rows that still lack an
// enrichment row, so it can be stopped/restarted freely. Designed to run as a
// long-lived workflow (not bound by the 120s shell timeout).
//
//   BATCH_SIZE    messages per LLM call (default 15)
//   CONCURRENCY   parallel LLM calls    (default 6)
//   PAGE          rows fetched per loop (default 900)
//   MAX_MESSAGES  optional cap for a bounded run (default: all)
const MVP_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const OWNER = process.env.WHATSAPP_OWNER;

interface Row {
  message_id: string;
  chat_type: string | null;
  text: string;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      if (attempt === maxAttempts) {
        console.error(`  ! ${label} failed after ${maxAttempts} attempts: ${msg}`);
        return null;
      }
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 15000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return null;
}

async function processBatch(slice: Row[]): Promise<number> {
  const inputs: ClassifyInput[] = slice.map((r) => ({
    messageId: r.message_id,
    text: r.text,
    chatType: r.chat_type,
  }));
  const results = await withRetry(() => classifyBatch(inputs), "classifyBatch");
  if (!results) return 0;

  const model = activeClassifyModel();
  let written = 0;
  for (const c of results) {
    const chatType = slice.find((s) => s.message_id === c.messageId)?.chat_type ?? null;
    const ok = await withRetry(
      () =>
        pool.query(
          `insert into message_enrichment
             (message_id, tenant_id, chat_type, category, sentiment, topics,
              is_question, requires_reply, summary, model_used)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict (message_id) do update set
             category = excluded.category,
             sentiment = excluded.sentiment,
             topics = excluded.topics,
             is_question = excluded.is_question,
             requires_reply = excluded.requires_reply,
             summary = excluded.summary,
             model_used = excluded.model_used,
             processed_at = now()`,
          [
            c.messageId,
            MVP_TENANT_ID,
            chatType,
            c.category,
            c.sentiment,
            c.topics,
            c.isQuestion,
            c.requiresReply,
            c.summary,
            model,
          ],
        ),
      "insert",
    );
    if (ok) written += 1;
  }
  return written;
}

async function runPool(batches: Row[][], concurrency: number): Promise<number> {
  let next = 0;
  let total = 0;
  async function worker(): Promise<void> {
    while (next < batches.length) {
      const idx = next++;
      total += await processBatch(batches[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()),
  );
  return total;
}

async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required.");
  const batchSize = Number(process.env.BATCH_SIZE ?? "15");
  const concurrency = Number(process.env.CONCURRENCY ?? "6");
  const page = Number(process.env.PAGE ?? "900");
  const maxMessages = process.env.MAX_MESSAGES ? Number(process.env.MAX_MESSAGES) : Infinity;

  console.log(
    `Full text backfill — provider=${process.env.CLASSIFY_PROVIDER ?? "openai"} ` +
      `model=${activeClassifyModel()} batch=${batchSize} concurrency=${concurrency} page=${page}`,
  );

  let grandTotal = 0;
  const startedAt = Date.now();

  while (grandTotal < maxMessages) {
    const limit = Math.min(page, maxMessages - grandTotal);
    const { rows } = await pool.query<Row>(
      `select m.message_id, m.chat_type,
              coalesce(nullif(m.message, ''), m.caption, m.transcription) as text
         from whatsapp_messages m
         left join message_enrichment e on e.message_id = m.message_id
        where m.whatsapp_owner = $1
          and m.message_id is not null
          and coalesce(nullif(m.message, ''), m.caption, m.transcription) is not null
          and length(coalesce(nullif(m.message, ''), m.caption, m.transcription)) >= 3
          and e.message_id is null
        order by m.message_created_at desc nulls last
        limit $2`,
      [OWNER, limit],
    );

    if (rows.length === 0) {
      console.log("No more un-enriched text messages. Done.");
      break;
    }

    const batches: Row[][] = [];
    for (let i = 0; i < rows.length; i += batchSize) batches.push(rows.slice(i, i + batchSize));
    const written = await runPool(batches, concurrency);
    grandTotal += written;

    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = grandTotal / Math.max(elapsed, 1);
    console.log(
      `  +${written} (total ${grandTotal}) — ${rate.toFixed(1)} msg/s, ${elapsed.toFixed(0)}s elapsed`,
    );

    // Avoid infinite loop when classification fails for every batch in a page.
    if (written === 0) {
      console.error(
        "  ! Nenhuma mensagem classificada nesta página — interrompendo (verifique OpenRouter/credenciais).",
      );
      break;
    }
  }

  const { rows: byCat } = await pool.query<{ category: string; n: string }>(
    `select category, count(*) n from message_enrichment
      where tenant_id = $1 group by category order by n desc`,
    [MVP_TENANT_ID],
  );
  console.log("\nCategory distribution (message_enrichment):");
  for (const r of byCat) console.log(`  ${r.category.padEnd(24)} ${r.n}`);

  await pool.end();
}

void main().catch((e) => {
  console.error("backfill-text-full failed:", (e as Error).message);
  process.exit(1);
});
