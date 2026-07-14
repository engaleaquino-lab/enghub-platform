-- EngHub Sprint 22 — Análise rápida indexada
-- Reutiliza bid_analysis_final_sections.
-- Execute caso ainda não tenha as colunas de progresso.

alter table public.bid_analyses
add column if not exists total_steps integer,
add column if not exists completed_steps integer not null default 0,
add column if not exists current_step text,
add column if not exists processing_started_at timestamptz,
add column if not exists last_heartbeat_at timestamptz;

notify pgrst, 'reload schema';
