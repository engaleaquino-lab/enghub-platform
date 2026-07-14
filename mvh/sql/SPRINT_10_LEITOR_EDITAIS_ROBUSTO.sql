-- EngHub Sprint 10 — Leitor robusto em múltiplas etapas
-- Execute depois das Sprints 08 e 09.
-- Pode ser executado mais de uma vez.

alter table public.bid_analysis_batches
add column if not exists attempts integer not null default 0;

create table if not exists public.bid_analysis_merges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  analysis_id uuid not null
    references public.bid_analyses(id) on delete cascade,
  document_id uuid not null
    references public.company_documents(id) on delete cascade,
  merge_index integer not null,
  batch_start integer not null,
  batch_end integer not null,
  status text not null default 'Pendente',
  merged_data jsonb,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (analysis_id, merge_index)
);

alter table public.bid_analysis_merges enable row level security;

drop policy if exists "bid analysis merges org access"
on public.bid_analysis_merges;

create policy "bid analysis merges org access"
on public.bid_analysis_merges for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_bid_analysis_merges_analysis
on public.bid_analysis_merges(analysis_id, merge_index);

create index if not exists idx_bid_analysis_merges_document
on public.bid_analysis_merges(document_id, created_at desc);

notify pgrst, 'reload schema';
