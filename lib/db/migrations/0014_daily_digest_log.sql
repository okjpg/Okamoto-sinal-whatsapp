-- Log de resumos diários enviados (evita duplicata no mesmo dia).
create table if not exists daily_digest_log (
  id bigint generated always as identity primary key,
  channel text not null,
  sent_at timestamptz not null default now()
);

create index if not exists daily_digest_log_channel_sent_idx
  on daily_digest_log (channel, sent_at desc);

alter table daily_digest_log enable row level security;
revoke all on table daily_digest_log from public, anon, authenticated;
