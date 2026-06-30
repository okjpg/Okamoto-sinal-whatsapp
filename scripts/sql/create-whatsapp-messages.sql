-- Tabela de origem read-only do Sinal (NÃO é criada pelas migrations do app).
-- Execute no SQL Editor do Supabase: https://supabase.com/dashboard/project/gkwawlsebigybxntvqpr/sql
--
-- Depois popule com suas mensagens. Toda linha deve ter whatsapp_owner = WHATSAPP_OWNER do .env

create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  whatsapp_owner text not null,
  chat_type text,
  chat_id text,
  chat_name text,
  contact_phone text,
  sender_phone text,
  sender_name text,
  recipient_phone text,
  direction text,
  message_type text,
  message text,
  caption text,
  media_url text,
  media_mime_type text,
  transcription text,
  message_id text not null unique,
  reply_to_message_id text,
  forwarded boolean,
  reaction text,
  reacted_to_message_id text,
  status text,
  message_created_at timestamptz,
  metadata jsonb default '{}'::jsonb
);

create index if not exists whatsapp_messages_owner_idx
  on public.whatsapp_messages (whatsapp_owner);

create index if not exists whatsapp_messages_owner_created_idx
  on public.whatsapp_messages (whatsapp_owner, message_created_at desc);

create index if not exists whatsapp_messages_message_id_idx
  on public.whatsapp_messages (message_id);
