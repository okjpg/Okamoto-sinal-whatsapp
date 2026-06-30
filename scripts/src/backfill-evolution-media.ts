import { pool } from "@workspace/db";
import {
  evolutionKeyFromRow,
  fetchEvolutionMedia,
  getEvolutionApiConfigFromEnv,
  isMediaMessage,
  mediaResultToDataUrl,
  normalizeRawType,
  type WhatsappMessageInsert,
} from "@workspace/evolution";

const OWNER = process.env.WHATSAPP_OWNER;

interface DbRow {
  message_id: string;
  chat_type: string;
  sender_phone: string | null;
  direction: string;
  message_type: string | null;
  media_mime_type: string | null;
  metadata: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required");

  const cfg = getEvolutionApiConfigFromEnv();
  if (!cfg) throw new Error("EVOLUTION_API_URL and EVOLUTION_API_KEY are required");

  const { rows } = await pool.query<DbRow>(
    `select message_id, chat_type, sender_phone, direction, message_type,
            media_mime_type, metadata
       from whatsapp_messages
      where whatsapp_owner = $1
        and media_url is null
        and (
          message_type ilike '%image%'
          or message_type ilike '%audio%'
          or message_type ilike '%video%'
          or message_type ilike '%document%'
          or message_type ilike '%sticker%'
          or message_type ilike '%ptt%'
        )
      order by message_created_at desc nulls last
      limit 200`,
    [OWNER],
  );

  if (rows.length === 0) {
    console.log("Nenhuma mídia pendente.");
    await pool.end();
    return;
  }

  console.log(`Processando ${rows.length} mensagem(ns) de mídia…`);

  let ok = 0;
  let fail = 0;

  for (const r of rows) {
    const meta =
      r.metadata && typeof r.metadata === "object" ? { ...r.metadata } : {};
    const rawType =
      (typeof meta.raw_type === "string" ? meta.raw_type : null) ??
      normalizeRawType(r.message_type);

    const stub: WhatsappMessageInsert = {
      whatsapp_owner: OWNER,
      chat_type: r.chat_type,
      chat_id: "",
      chat_name: null,
      contact_phone: null,
      sender_phone: r.sender_phone,
      sender_name: null,
      recipient_phone: null,
      direction: r.direction,
      message_type: r.message_type,
      message: null,
      caption: null,
      media_url: null,
      media_mime_type: r.media_mime_type,
      message_id: r.message_id,
      reply_to_message_id: null,
      forwarded: null,
      status: null,
      message_created_at: null,
      metadata: { ...meta, raw_type: rawType },
    };

    if (!isMediaMessage(stub)) continue;

    const key = evolutionKeyFromRow(stub);
    if (!key) {
      console.warn(`  ✗ ${r.message_id} — sem evolutionKey`);
      fail++;
      continue;
    }

    const instanceFromId = r.message_id.split(":")[0];
    const mediaCfg = instanceFromId ? { ...cfg, instance: instanceFromId } : cfg;

    try {
      const media = await fetchEvolutionMedia(mediaCfg, key);
      if (!media) {
        console.warn(`  ✗ ${r.message_id} — Evolution não retornou mídia`);
        fail++;
        continue;
      }

      const mediaUrl = mediaResultToDataUrl(media);
      await pool.query(
        `update whatsapp_messages
            set media_url = $2,
                media_mime_type = coalesce($3, media_mime_type),
                metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
          where message_id = $1`,
        [
          r.message_id,
          mediaUrl,
          media.mimetype,
          JSON.stringify({ raw_type: rawType, evolutionKey: key }),
        ],
      );
      console.log(`  ✓ ${r.message_id} (${rawType})`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${r.message_id} — ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\nConcluído: ${ok} ok, ${fail} falha(s).`);
  await pool.end();
}

void main().catch(async (e) => {
  console.error("backfill-evolution-media failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
