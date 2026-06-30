import { pool } from "@workspace/db";

// Backfill metadata.raw_type from message_type / media_mime_type when Evolution
// ingested rows before raw_type was normalized. Idempotent.
const OWNER = process.env.WHATSAPP_OWNER;

async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required.");

  const { rowCount } = await pool.query(
    `update whatsapp_messages m
        set metadata = jsonb_set(
              coalesce(m.metadata, '{}'::jsonb),
              '{raw_type}',
              to_jsonb(
                case
                  when lower(coalesce(m.message_type, '')) like '%image%' then 'ImageMessage'
                  when lower(coalesce(m.message_type, '')) like '%sticker%' then 'StickerMessage'
                  when lower(coalesce(m.message_type, '')) in ('ptvmessage')
                    or lower(coalesce(m.message_type, '')) like '%video%' then 'VideoMessage'
                  when lower(coalesce(m.message_type, '')) like '%document%' then 'DocumentMessage'
                  when lower(coalesce(m.message_type, '')) like '%audio%'
                    or lower(coalesce(m.message_type, '')) like '%ptt%' then 'AudioMessage'
                  when coalesce(m.media_mime_type, '') like 'image/%' then 'ImageMessage'
                  when coalesce(m.media_mime_type, '') like 'audio/%' then 'AudioMessage'
                  when coalesce(m.media_mime_type, '') like 'video/%' then 'VideoMessage'
                  when coalesce(m.media_mime_type, '') like 'application/%' then 'DocumentMessage'
                end
              ),
              true
            )
      where m.whatsapp_owner = $1
        and coalesce(m.metadata->>'raw_type', '') = ''
        and (
          lower(coalesce(m.message_type, '')) like any(array['%image%','%audio%','%ptt%','%video%','%document%','%sticker%'])
          or coalesce(m.media_mime_type, '') ~ '^(image|audio|video|application)/'
        )`,
    [OWNER],
  );

  console.log(`✓ raw_type backfill: ${rowCount ?? 0} rows updated.`);
  await pool.end();
}

void main().catch(async (e) => {
  console.error("backfill-raw-type failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
