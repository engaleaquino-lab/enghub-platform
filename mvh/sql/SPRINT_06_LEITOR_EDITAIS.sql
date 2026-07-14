
-- EngHub Sprint 06 — Leitor Inteligente de Editais

create table if not exists public.bid_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.company_documents(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'Processando',
  executive_summary text,
  extracted_data jsonb not null default '{}'::jsonb,
  recommendation text,
  risk_level text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.bid_analyses enable row level security;

drop policy if exists "bid analyses org access"
on public.bid_analyses;

create policy "bid analyses org access"
on public.bid_analyses for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_bid_analyses_org_created
on public.bid_analyses(organization_id, created_at desc);

create index if not exists idx_bid_analyses_document
on public.bid_analyses(document_id, created_at desc);
