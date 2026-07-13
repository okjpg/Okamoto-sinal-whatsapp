-- Per-tenant OpenRouter / model selection (edited from the admin panel).

create table if not exists tenant_ai_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  mode text not null default 'auto_free',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists tenant_ai_settings_updated_idx
  on tenant_ai_settings (updated_at desc);
