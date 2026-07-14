-- EngHub Sprint 18 — Consolidação final em blocos
-- Execute depois das Sprints 09 e 10.
-- Pode ser executado mais de uma vez.

create table if not exists public.bid_analysis_final_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  analysis_id uuid not null
    references public.bid_analyses(id) on delete cascade,
  document_id uuid not null
    references public.company_documents(id) on delete cascade,
  section_index integer not null,
  section_name text not null,
  status text not null default 'Pendente',
  section_data jsonb,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (analysis_id, section_index)
);

alter table public.bid_analysis_final_sections enable row level security;

drop policy if exists "bid analysis final sections org access"
on public.bid_analysis_final_sections;

create policy "bid analysis final sections org access"
on public.bid_analysis_final_sections for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_bid_analysis_final_sections_analysis
on public.bid_analysis_final_sections(analysis_id, section_index);

notify pgrst, 'reload schema';
