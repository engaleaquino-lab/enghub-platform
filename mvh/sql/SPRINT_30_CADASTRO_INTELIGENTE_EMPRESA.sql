-- EngHub Sprint 30 — Cadastro Inteligente da Empresa
-- Pode ser executado mais de uma vez.

create table if not exists public.company_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  document_type text not null,
  name text not null,
  document_number text,
  issuing_body text,
  issue_date date,
  expiry_date date,
  notes text,
  storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_technical_professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null,
  profession text not null,
  council text not null default 'CREA',
  registration_number text not null,
  registration_state text,
  employment_type text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_technical_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  capability_type text not null default 'Atestado',
  title text not null,
  service text not null,
  quantity numeric,
  unit text,
  certificate_number text,
  issuing_entity text,
  professional_id uuid
    references public.company_technical_professionals(id)
    on delete set null,
  public_private text,
  completion_date date,
  notes text,
  storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_financial_qualification (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  reference_year integer not null,
  balance_date date,
  share_capital numeric,
  net_worth numeric,
  current_liquidity numeric,
  general_liquidity numeric,
  general_solvency numeric,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference_year)
);

alter table public.company_compliance_documents enable row level security;
alter table public.company_technical_professionals enable row level security;
alter table public.company_technical_capabilities enable row level security;
alter table public.company_financial_qualification enable row level security;

drop policy if exists "company compliance documents org access"
on public.company_compliance_documents;
create policy "company compliance documents org access"
on public.company_compliance_documents for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "company technical professionals org access"
on public.company_technical_professionals;
create policy "company technical professionals org access"
on public.company_technical_professionals for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "company technical capabilities org access"
on public.company_technical_capabilities;
create policy "company technical capabilities org access"
on public.company_technical_capabilities for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "company financial qualification org access"
on public.company_financial_qualification;
create policy "company financial qualification org access"
on public.company_financial_qualification for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_company_documents_org_expiry
on public.company_compliance_documents(organization_id, expiry_date);

create index if not exists idx_company_professionals_org
on public.company_technical_professionals(organization_id, active);

create index if not exists idx_company_capabilities_org_service
on public.company_technical_capabilities(organization_id, service);

create index if not exists idx_company_financial_org_year
on public.company_financial_qualification(organization_id, reference_year desc);

notify pgrst, 'reload schema';
