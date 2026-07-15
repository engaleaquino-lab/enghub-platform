create table if not exists public.bid_dossiers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null, notice_number text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.bid_dossier_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 dossier_id uuid not null references public.bid_dossiers(id) on delete cascade,
 document_id uuid not null references public.company_documents(id) on delete cascade,
 document_role text, sort_order integer not null default 0, created_at timestamptz not null default now(), unique(dossier_id,document_id));
alter table public.bid_analyses add column if not exists dossier_id uuid references public.bid_dossiers(id) on delete set null;
alter table public.bid_dossiers enable row level security; alter table public.bid_dossier_documents enable row level security;
drop policy if exists "bid dossiers org access" on public.bid_dossiers;
create policy "bid dossiers org access" on public.bid_dossiers for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
drop policy if exists "bid dossier documents org access" on public.bid_dossier_documents;
create policy "bid dossier documents org access" on public.bid_dossier_documents for all using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create index if not exists idx_bid_dossier_documents_dossier on public.bid_dossier_documents(dossier_id,sort_order);
create index if not exists idx_bid_analyses_dossier on public.bid_analyses(dossier_id);
notify pgrst,'reload schema';
