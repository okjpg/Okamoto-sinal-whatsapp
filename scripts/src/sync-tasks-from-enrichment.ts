import { pool, MVP_TENANT_ID } from "@workspace/db";

const OWNER = process.env.WHATSAPP_OWNER;

/** Auto-create tasks + invite triage rows from classified messages. Idempotent. */
async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required");
  const tenantId = MVP_TENANT_ID;

  const { rows: candidates } = await pool.query<{
    message_id: string;
    summary: string | null;
    category: string | null;
    phone: string;
    name: string | null;
    direction: string;
    chat_type: string;
  }>(
    `select e.message_id, e.summary, e.category,
            coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) as phone,
            coalesce(nullif(m.chat_name,''), m.sender_name) as name,
            m.direction, e.chat_type
       from message_enrichment e
       join whatsapp_messages m
         on m.message_id = e.message_id and m.whatsapp_owner = $2
      where e.tenant_id = $1
        and m.direction = 'inbound'
        and e.requires_reply is true
        and (
          e.chat_type = 'private'
          or (e.chat_type = 'group' and m.chat_id is not null)
        )
        and coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) is not null
        and not exists (
          select 1 from tasks t
           where t.tenant_id = $1 and t.source_message_id = e.message_id
        )`,
    [tenantId, OWNER],
  );

  let tasksCreated = 0;
  for (const row of candidates) {
    let contactId: string | null = null;
    if (row.chat_type === "private") {
      const contact = await pool.query<{ id: string }>(
        `select id from contacts
          where tenant_id = $1 and primary_phone = $2
          limit 1`,
        [tenantId, row.phone],
      );
      contactId = contact.rows[0]?.id ?? null;
    }
    const title =
      (row.summary?.trim() || "Responder mensagem").slice(0, 240) ||
      "Responder mensagem";
    const note = row.summary?.trim() || null;
    const direction = row.chat_type === "group" ? "theirs" : "mine";

    await pool.query(
      `insert into tasks
         (tenant_id, contact_id, title, note, direction, source_message_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [tenantId, contactId, title, note, direction, row.message_id],
    );
    tasksCreated++;
  }

  const inviteRes = await pool.query(
    `with src as (
       select e.message_id, e.summary, m.direction,
              coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) as phone,
              coalesce(nullif(m.chat_name,''), m.sender_name) as name,
              m.message_created_at as at
         from message_enrichment e
         join whatsapp_messages m
           on m.message_id = e.message_id and m.whatsapp_owner = $2
        where e.tenant_id = $1
          and e.chat_type = 'private'
          and m.direction = 'inbound'
          and (
            e.category in ('convite', 'oportunidade/parceria')
            or (e.category in ('networking', 'suporte/dúvida') and e.requires_reply is true)
          )
          and coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) is not null
     ),
     latest as (
       select distinct on (phone)
              message_id, summary, direction, phone, name, at
         from src
        order by phone, at desc
     )
     insert into invite_triage
       (tenant_id, chat_id, status, source_message_id, direction, name, contact_id)
     select $1, l.phone, 'aberto', l.message_id, l.direction, l.name, c.id
       from latest l
       left join contacts c
         on c.tenant_id = $1 and c.primary_phone = l.phone
      on conflict (tenant_id, chat_id) do nothing`,
    [tenantId, OWNER],
  );

  console.log(
    `✓ ${tasksCreated} task(s) criada(s) a partir de requires_reply inbound.`,
  );
  console.log(
    `✓ ${inviteRes.rowCount ?? 0} convite(s)/oportunidade(s) registrado(s) em invite_triage (novos).`,
  );

  const { rows: openCount } = await pool.query<{ n: string }>(
    `select count(*)::text as n from tasks where tenant_id = $1 and done = false`,
    [tenantId],
  );
  console.log(`  Total tasks abertas: ${openCount[0]?.n ?? 0}`);

  await pool.end();
}

void main().catch(async (e) => {
  console.error("sync-tasks-from-enrichment failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
