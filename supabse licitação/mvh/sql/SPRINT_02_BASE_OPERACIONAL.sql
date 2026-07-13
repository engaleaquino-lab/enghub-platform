-- EngHub Sprint 02 — Base Operacional
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  type text not null check (type in ('Receita','Despesa','Imposto','Retenção')),
  description text not null,
  category text,
  document_number text,
  due_date date,
  payment_date date,
  amount numeric not null default 0,
  paid_amount numeric not null default 0,
  status text not null default 'Pendente',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.financial_entries enable row level security;

drop policy if exists "financial entries org access"
on public.financial_entries;

create policy "financial entries org access"
on public.financial_entries for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create index if not exists idx_financial_entries_org_due
on public.financial_entries(organization_id, due_date);

create index if not exists idx_financial_entries_contract
on public.financial_entries(contract_id);
