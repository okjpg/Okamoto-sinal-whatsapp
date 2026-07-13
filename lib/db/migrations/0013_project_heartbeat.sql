-- Daily keep-alive to prevent Free Plan project pausing due to inactivity.
-- Supabase pauses inactive Free projects after ~7 days without enough DB activity.
-- See: https://supabase.com/docs/guides/platform/free-project-pausing

create table if not exists project_heartbeats (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now(),
  source text not null default 'manual'
);

comment on table project_heartbeats is
  'Daily pings to keep the Supabase project active on the Free plan.';

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

-- pg_cron runs inside Postgres — no Mac, GitHub Actions, or cron externo necessários.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception
  when others then
    raise notice 'pg_cron not enabled yet — enable in Dashboard → Integrations → Cron';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sinal-daily-heartbeat') then
      perform cron.unschedule('sinal-daily-heartbeat');
    end if;
  end if;
exception
  when undefined_table then
  null;
end;
$$;

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'sinal-daily-heartbeat',
      '0 9 * * *',
      $cron$select public.sinal_project_heartbeat('pg_cron')$cron$
    );
  end if;
exception
  when undefined_table then
    raise notice 'cron.job not found — enable pg_cron in Dashboard first';
  when others then
    raise notice 'Could not schedule heartbeat: %', sqlerrm;
end;
$outer$;
