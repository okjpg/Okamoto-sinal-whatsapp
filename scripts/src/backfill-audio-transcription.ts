import { pool } from "@workspace/db";
import { Buffer } from "node:buffer";

const MVP_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const OWNER = process.env.WHATSAPP_OWNER;

interface AudioRow {
  message_id: string;
  media_url: string;
  media_mime_type: string | null;
}

function parseDataUrl(url: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(url.trim());
  if (!m) return null;
  return { mime: m[1]!, buffer: Buffer.from(m[2]!, "base64") };
}

async function loadAudioBuffer(
  mediaUrl: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const data = parseDataUrl(mediaUrl);
  if (data) return data;

  if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
    const r = await fetch(mediaUrl);
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") ?? "audio/ogg";
    return { buffer: Buffer.from(await r.arrayBuffer()), mime };
  }
  return null;
}

async function transcribe(
  apiKey: string,
  buffer: Buffer,
  mime: string,
): Promise<string | null> {
  const ext =
    mime.includes("mpeg") || mime.includes("mp3")
      ? "mp3"
      : mime.includes("wav")
        ? "wav"
        : mime.includes("mp4")
          ? "mp4"
          : "ogg";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "pt");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) {
    throw new Error(`Whisper ${r.status}: ${await r.text()}`);
  }
  const j = (await r.json()) as { text?: string };
  const text = j.text?.trim();
  return text && text.length >= 2 ? text : null;
}

async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required.");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.log("OPENAI_API_KEY ausente — pulando transcrição de áudio.");
    await pool.end();
    return;
  }

  const limit = Number(process.env.MAX_MESSAGES ?? "20");
  const { rows } = await pool.query<AudioRow>(
    `select message_id, media_url, media_mime_type
       from whatsapp_messages
      where whatsapp_owner = $1
        and coalesce(transcription, '') = ''
        and media_url is not null
        and (
          message_type ilike '%audio%'
          or message_type ilike '%ptt%'
          or coalesce(media_mime_type, '') ilike 'audio/%'
          or coalesce(metadata->>'raw_type', '') in ('audio', 'ptt', 'voice')
        )
      order by message_created_at desc nulls last
      limit $2`,
    [OWNER, limit],
  );

  if (rows.length === 0) {
    console.log("Nenhum áudio pendente de transcrição.");
    await pool.end();
    return;
  }

  console.log(`Transcrevendo até ${rows.length} áudio(s)…`);
  let ok = 0;

  for (const row of rows) {
    try {
      const loaded = await loadAudioBuffer(row.media_url);
      if (!loaded) {
        console.warn(`  ✗ ${row.message_id} — mídia indisponível`);
        continue;
      }
      const text = await transcribe(apiKey, loaded.buffer, loaded.mime);
      if (!text) {
        console.warn(`  ✗ ${row.message_id} — transcrição vazia`);
        continue;
      }
      await pool.query(
        `update whatsapp_messages set transcription = $2 where message_id = $1`,
        [row.message_id, text],
      );
      await pool.query(
        `insert into media_assets (message_id, tenant_id, kind, extracted_text, status, model_used, processed_at)
         values ($1, $2, 'audio', $3, 'done', 'whisper-1', now())
         on conflict (message_id) do update set
           extracted_text = excluded.extracted_text,
           status = excluded.status,
           model_used = excluded.model_used,
           processed_at = now()`,
        [row.message_id, MVP_TENANT_ID, text],
      );
      console.log(`  ✓ ${row.message_id} (${text.slice(0, 60)}…)`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${row.message_id} — ${(e as Error).message}`);
    }
  }

  console.log(`Concluído: ${ok}/${rows.length} transcrito(s).`);
  await pool.end();
}

void main().catch(async (e) => {
  console.error("backfill-audio-transcription failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
