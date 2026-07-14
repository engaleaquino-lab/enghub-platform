-- EngHub Sprint 09 — Análise integral de editais por lotes
-- Execute depois do SQL do Leitor de Editais.

create table if not exists public.bid_analysis_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null references public.bid_analyses(id) on delete cascade,
  document_id uuid not null references public.company_documents(id) on delete cascade,
  batch_index integer not null,
  chunk_start integer not null,
  chunk_end integer not null,
  status text not null default 'Pendente',
  partial_data jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (analysis_id, batch_index)
);

alter table public.bid_analysis_batches enable row level security;

drop policy if exists "bid analysis batches org access"
on public.bid_analysis_batches;

create policy "bid analysis batches org access"
on public.bid_analysis_batches for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_bid_analysis_batches_analysis
on public.bid_analysis_batches(analysis_id, batch_index);

create index if not exists idx_bid_analysis_batches_document
on public.bid_analysis_batches(document_id, created_at desc);

notify pgrst, 'reload schema';
