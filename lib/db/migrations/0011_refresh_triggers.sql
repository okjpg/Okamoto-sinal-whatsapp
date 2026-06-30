-- Allow webhook-triggered and quick incremental refresh cycles.

alter table refresh_runs drop constraint if exists refresh_runs_trigger_check;

alter table refresh_runs add constraint refresh_runs_trigger_check
  check (trigger in ('manual', 'scheduled', 'webhook', 'quick'));
