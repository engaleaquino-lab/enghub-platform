-- EngHub Sprint 04 — Biblioteca Inteligente

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  category text,
  mime_type text,
  file_size bigint,
  storage_path text,
  issue_date date,
  expiry_date date,
  status text not null default 'Válido',
  processing_status text not null default 'Pendente',
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.company_documents(id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  fts tsvector generated always as (to_tsvector('portuguese', coalesce(content,''))) stored,
  created_at timestamptz not null default now()
);

alter table public.company_documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "company documents org access" on public.company_documents;
create policy "company documents org access" on public.company_documents for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "document chunks org access" on public.document_chunks;
create policy "document chunks org access" on public.document_chunks for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_company_documents_org_category
on public.company_documents(organization_id,category);
create index if not exists idx_company_documents_expiry
on public.company_documents(organization_id,expiry_date);
create index if not exists idx_document_chunks_fts
on public.document_chunks using gin(fts);
create index if not exists idx_document_chunks_document
on public.document_chunks(document_id,chunk_index);
