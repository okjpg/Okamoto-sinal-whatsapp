import { pool, syncMonitoredEntityFromEnv } from "@workspace/db";
import { classifyMentions, type MentionInput } from "@workspace/ai";

// Phase 6 (part 2) — Mentions. For each monitored entity, collect candidate
// messages (alias match, @-mentions, enriched topics, semantic scan), classify
// with the LLM, and persist genuine mentions.
//
//   MENTION_SAMPLE (default 500) — max candidates per entity per run
//   MENTION_RECENT_HOURS — when set, only scan messages from the last N hours
// Run: pnpm --filter @workspace/scripts run build-mentions
const T = "00000000-0000-0000-0000-000000000001";
const OWNER = process.env.WHATSAPP_OWNER;

interface Entity {
  id: string;
  name: string;
  aliases: string[] | null;
}

interface Candidate {
  message_id: string;
  text: string;
}

function digits(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

const MESSAGE_TEXT_SQL = `coalesce(
  nullif(trim(m.message), ''),
  nullif(trim(m.caption), ''),
  nullif(trim(m.transcription), '')
)`;

/** Inbound only — excludes the owner's own messages (incl. group LID senders). */
const INBOUND_OTHERS_WHERE = `
  m.direction = 'inbound'
  and regexp_replace(coalesce(m.sender_phone, ''), '\\D', '', 'g') <> $2
`;

function recentSql(hours: number): string {
  if (!hours || hours <= 0) return "";
  return `and m.message_created_at >= now() - (${hours} || ' hours')::interval`;
}

async function fetchOwnerMentionTokens(owner: string): Promise<string[]> {
  const ownerNorm = digits(owner);
  const { rows } = await pool.query<{ token: string }>(
    `select distinct token from (
       select regexp_replace(coalesce(sender_phone, ''), '\\D', '', 'g') as token
         from whatsapp_messages
        where whatsapp_owner = $1 and direction = 'outbound'
          and coalesce(sender_phone, '') <> ''
       union all
       select $2 as token
     ) t
     where length(token) >= 8`,
    [owner, ownerNorm],
  );
  return rows.map((r) => r.token).filter(Boolean);
}

async function fetchAliasCandidates(
  ent: Entity,
  owner: string,
  ownerNorm: string,
  sample: number,
  recentHours: number,
): Promise<Candidate[]> {
  const aliases = (ent.aliases?.length ? ent.aliases : [ent.name]).filter(Boolean);
  const params: unknown[] = [owner, ownerNorm];
  const likeClauses = aliases.map((a) => {
    params.push(`%${a}%`);
    return `${MESSAGE_TEXT_SQL} ILIKE $${params.length}`;
  });

  const { rows } = await pool.query<Candidate>(
    `select m.message_id, ${MESSAGE_TEXT_SQL} as text
       from whatsapp_messages m
      where m.whatsapp_owner = $1
        and ${INBOUND_OTHERS_WHERE}
        and ${MESSAGE_TEXT_SQL} is not null
        and (${likeClauses.join(" or ")})
        ${recentSql(recentHours)}
      order by m.message_created_at desc
      limit ${sample}`,
    params,
  );
  return rows;
}

async function fetchAtMentionCandidates(
  owner: string,
  ownerNorm: string,
  tokens: string[],
  sample: number,
  recentHours: number,
): Promise<Candidate[]> {
  if (tokens.length === 0) return [];
  const params: unknown[] = [owner, ownerNorm];
  const clauses = tokens.map((t) => {
    params.push(`%@${t}%`);
    return `${MESSAGE_TEXT_SQL} ILIKE $${params.length}`;
  });
  // Also match shorter @ suffixes (WhatsApp sometimes stores partial ids).
  for (const t of tokens) {
    if (t.length >= 10) {
      params.push(`%@${t.slice(-10)}%`);
      clauses.push(`${MESSAGE_TEXT_SQL} ILIKE $${params.length}`);
    }
  }

  const { rows } = await pool.query<Candidate>(
    `select m.message_id, ${MESSAGE_TEXT_SQL} as text
       from whatsapp_messages m
      where m.whatsapp_owner = $1
        and ${INBOUND_OTHERS_WHERE}
        and ${MESSAGE_TEXT_SQL} is not null
        and (${clauses.join(" or ")})
        ${recentSql(recentHours)}
      order by m.message_created_at desc
      limit ${sample}`,
    params,
  );
  return rows;
}

async function fetchTopicCandidates(
  ent: Entity,
  owner: string,
  ownerNorm: string,
  sample: number,
  recentHours: number,
): Promise<Candidate[]> {
  const aliases = (ent.aliases?.length ? ent.aliases : [ent.name]).filter(Boolean);
  const params: unknown[] = [T, owner, ownerNorm];
  const topicClauses = aliases.map((a) => {
    params.push(`%${a.toLowerCase()}%`);
    return `lower(trim(tp)) like $${params.length}`;
  });

  const { rows } = await pool.query<Candidate>(
    `select message_id, text from (
       select distinct on (m.message_id)
              m.message_id,
              ${MESSAGE_TEXT_SQL} as text,
              m.message_created_at
         from message_enrichment e
         join whatsapp_messages m on m.message_id = e.message_id
          and m.whatsapp_owner = $2
        where e.tenant_id = $1
          and m.direction = 'inbound'
          and regexp_replace(coalesce(m.sender_phone, ''), '\\D', '', 'g') <> $3
          and e.topics is not null
          and ${MESSAGE_TEXT_SQL} is not null
          and exists (
            select 1 from unnest(e.topics) as tp
             where ${topicClauses.join(" or ")}
          )
          ${recentSql(recentHours)}
        order by m.message_id, m.message_created_at desc
     ) q
     order by message_created_at desc
     limit ${sample}`,
    params,
  );
  return rows;
}

async function fetchSemanticCandidates(
  entId: string,
  owner: string,
  ownerNorm: string,
  sample: number,
  recentHours: number,
): Promise<Candidate[]> {
  const { rows } = await pool.query<Candidate>(
    `select m.message_id, ${MESSAGE_TEXT_SQL} as text
       from whatsapp_messages m
      where m.whatsapp_owner = $1
        and ${INBOUND_OTHERS_WHERE}
        and regexp_replace(coalesce(m.sender_phone, ''), '\\D', '', 'g') <> ''
        and ${MESSAGE_TEXT_SQL} is not null
        and length(${MESSAGE_TEXT_SQL}) >= 8
        and not exists (
          select 1 from mentions mn
           where mn.message_id = m.message_id and mn.entity_id = $3
        )
        ${recentSql(recentHours)}
      order by m.message_created_at desc
      limit ${sample}`,
    [owner, ownerNorm, entId],
  );
  return rows;
}

function mergeCandidates(lists: Candidate[], cap: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (!row.text?.trim() || seen.has(row.message_id)) continue;
      seen.add(row.message_id);
      out.push(row);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required.");
  await syncMonitoredEntityFromEnv(pool, T);
  const sample = Number(process.env.MENTION_SAMPLE ?? "500");
  const recentHours = Number(process.env.MENTION_RECENT_HOURS ?? "0");
  const ownerNorm = digits(OWNER);
  const mentionTokens = await fetchOwnerMentionTokens(OWNER);

  const { rows: entities } = await pool.query<Entity>(
    `select id, name, aliases from monitored_entities where tenant_id = $1`,
    [T],
  );
  console.log(`Found ${entities.length} monitored entities.`);
  console.log(`Owner @-mention tokens: ${mentionTokens.join(", ") || "(none)"}`);

  const { rows: msgStats } = await pool.query<{ total: string; inbound_others: string }>(
    `select count(*)::int as total,
            count(*) filter (
              where direction = 'inbound'
                and regexp_replace(coalesce(sender_phone, ''), '\\D', '', 'g') <> $2
            )::int as inbound_others
       from whatsapp_messages
      where whatsapp_owner = $1`,
    [OWNER, ownerNorm],
  );
  console.log(
    `Messages: ${msgStats[0]?.total ?? 0} total, ${msgStats[0]?.inbound_others ?? 0} inbound from others.`,
  );

  for (const ent of entities) {
    const aliases = (ent.aliases?.length ? ent.aliases : [ent.name]).filter(Boolean);
    const aliasHits = await fetchAliasCandidates(ent, OWNER, ownerNorm, sample, recentHours);
    const atHits = await fetchAtMentionCandidates(OWNER, ownerNorm, mentionTokens, sample, recentHours);
    const topicHits = await fetchTopicCandidates(ent, OWNER, ownerNorm, sample, recentHours);
    const semanticHits = await fetchSemanticCandidates(ent.id, OWNER, ownerNorm, sample, recentHours);

    const cands = mergeCandidates([atHits, aliasHits, topicHits, semanticHits], sample);
    console.log(
      `  [${ent.name}] candidates: ${cands.length} (@ ${atHits.length}, alias ${aliasHits.length}, topics ${topicHits.length}, semantic ${semanticHits.length}).`,
    );

    const { rows: existing } = await pool.query<{ message_id: string }>(
      `select message_id from mentions where tenant_id = $1 and entity_id = $2`,
      [T, ent.id],
    );
    const seen = new Set(existing.map((r) => r.message_id));
    let added = 0;

    // WhatsApp @-mentions of the owner are explicit — no LLM needed.
    const atIds = new Set(atHits.map((c) => c.message_id));
    for (const id of atIds) {
      if (seen.has(id)) continue;
      await pool.query(
        `insert into mentions (tenant_id, message_id, entity_id, mention_type, sentiment)
         values ($1,$2,$3,$4,$5)`,
        [T, id, ent.id, "indireta", "neutro"],
      );
      seen.add(id);
      added += 1;
    }

    const llmCandidates = cands.filter((c) => !atIds.has(c.message_id));
    if (llmCandidates.length === 0) {
      console.log(`  [${ent.name}] @-mentions inserted: ${added}, LLM skipped.`);
      continue;
    }

    const inputs: MentionInput[] = llmCandidates.map((c) => ({
      messageId: c.message_id,
      text: c.text,
    }));
    const results = await classifyMentions(ent.name, inputs, { aliases });
    const genuine = results.filter((r) => r.isMention);

    for (const r of genuine) {
      if (seen.has(r.messageId)) continue;
      await pool.query(
        `insert into mentions (tenant_id, message_id, entity_id, mention_type, sentiment)
         values ($1,$2,$3,$4,$5)`,
        [T, r.messageId, ent.id, r.mentionType, r.sentiment],
      );
      seen.add(r.messageId);
      added += 1;
    }
    console.log(
      `  [${ent.name}] genuine: ${genuine.length}/${results.length}, total new: ${added}`,
    );
  }

  const { rows: byType } = await pool.query<{ mention_type: string; n: string }>(
    `select mention_type, count(*) n from mentions where tenant_id = $1
      group by mention_type order by n desc`,
    [T],
  );
  console.log("\nMention type distribution:");
  for (const r of byType) console.log(`  ${(r.mention_type ?? "(null)").padEnd(16)} ${r.n}`);

  await pool.end();
}

void main().catch(async (e) => {
  console.error("build-mentions failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
