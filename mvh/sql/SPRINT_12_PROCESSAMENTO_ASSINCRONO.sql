-- EngHub Sprint 12 — Processamento assíncrono e retomável
-- Execute depois das Sprints 09 e 10.
-- Pode ser executado mais de uma vez.

alter table public.bid_analyses
add column if not exists total_steps integer,
add column if not exists completed_steps integer not null default 0,
add column if not exists current_step text,
add column if not exists processing_started_at timestamptz,
add column if not exists last_heartbeat_at timestamptz;

create index if not exists idx_bid_analyses_processing
on public.bid_analyses(organization_id, status, created_at desc);

notify pgrst, 'reload schema';
