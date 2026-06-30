-- One-time password reset tokens (custom SMTP flow, not Supabase email).

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_hash_idx
  on password_reset_tokens (token_hash)
  where used_at is null;

create index if not exists password_reset_tokens_user_idx
  on password_reset_tokens (user_id, created_at desc);
