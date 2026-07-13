-- EngHub Sprint 03 — Contratos completos
alter table public.contracts
  add column if not exists notice_number text,
  add column if not exists modality text,
  add column if not exists process_number text,
  add column if not exists manager_name text,
  add column if not exists manager_email text,
  add column if not exists manager_phone text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists term_end_date date,
  add column if not exists execution_days integer,
  add column if not exists location text,
  add column if not exists notes text;

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  event_date date not null default current_date,
  event_type text not null,
  title text not null,
  description text,
  responsible text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.contract_events enable row level security;
drop policy if exists "contract events org access" on public.contract_events;
create policy "contract events org access"
on public.contract_events for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_contract_events_contract_date
on public.contract_events(contract_id,event_date desc,created_at desc);
