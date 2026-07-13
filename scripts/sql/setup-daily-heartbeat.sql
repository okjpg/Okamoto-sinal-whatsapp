-- Keep-alive diário para o plano Free do Supabase (evita pausa por inatividade).
-- Execute no SQL Editor: https://supabase.com/dashboard/project/gkwawlsebigybxntvqpr/sql
--
-- Passo 1 (se ainda não fez): Dashboard → Integrations → Cron → Enable pg_cron
-- Passo 2: cole e execute este arquivo inteiro.

create table if not exists project_heartbeats (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now(),
  source text not null default 'manual'
);

alter table project_heartbeats enable row level security;
revoke all on table project_heartbeats from public, anon, authenticated;

create or replace function public.sinal_project_heartbeat(p_source text default 'pg_cron')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into project_heartbeats (source) values (p_source);
  delete from project_heartbeats
    where pinged_at < now() - interval '90 days';
end;
$$;

revoke all on function public.sinal_project_heartbeat(text) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule('sinal-daily-heartbeat')
where exists (select 1 from cron.job where jobname = 'sinal-daily-heartbeat');

-- 09:00 UTC ≈ 06:00 em Brasília
select cron.schedule(
  'sinal-daily-heartbeat',
  '0 9 * * *',
  $$select public.sinal_project_heartbeat('pg_cron')$$
);

-- Ping imediato para registrar atividade hoje:
select public.sinal_project_heartbeat('setup');

-- Verificar:
select schedule, jobname, active from cron.job where jobname = 'sinal-daily-heartbeat';
select pinged_at, source from project_heartbeats order by id desc limit 5;
