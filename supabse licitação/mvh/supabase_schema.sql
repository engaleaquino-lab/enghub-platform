
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','engineer','architect','finance','member')),
  status text not null default 'active' check (status in ('active','invited','inactive')),
  created_at timestamptz not null default now(),
  unique(organization_id,user_id)
);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_number text not null,
  client_name text,
  object text,
  contract_value numeric not null default 0,
  measured_value numeric not null default 0,
  received_value numeric not null default 0,
  status text not null default 'Planejamento',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  number text,
  competence text,
  measured_value numeric not null default 0,
  invoice_number text,
  status text not null default 'Em elaboração',
  received_value numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  type text,
  description text,
  value numeric not null default 0,
  days integer not null default 0,
  status text not null default 'Em análise',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists contract_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  name text not null,
  category text,
  expiry_date date,
  status text,
  storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists schedule_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  stage text,
  activity text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  progress numeric not null default 0,
  status text,
  responsible text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  title text not null,
  due_date date,
  priority text,
  status text,
  responsible text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  agency text,
  session_date timestamptz,
  estimated_value numeric default 0,
  status text default 'Em análise',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.create_default_organization()
returns trigger language plpgsql security definer set search_path=public as $$
declare org_id uuid;
begin
  insert into profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;
  insert into organizations(name,created_by) values('Minha Empresa',new.id) returning id into org_id;
  insert into organization_members(organization_id,user_id,role,status)
  values(org_id,new.id,'owner','active');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_default_organization();

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from organization_members
    where organization_id=org_id and user_id=auth.uid() and status='active'
  );
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from organization_members
    where organization_id=org_id and user_id=auth.uid()
      and role in ('owner','admin') and status='active'
  );
$$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table organization_members enable row level security;
alter table invitations enable row level security;
alter table contracts enable row level security;
alter table measurements enable row level security;
alter table addenda enable row level security;
alter table contract_documents enable row level security;
alter table schedule_items enable row level security;
alter table tasks enable row level security;
alter table bids enable row level security;

create policy "profiles own select" on profiles for select using(id=auth.uid());
create policy "profiles own update" on profiles for update using(id=auth.uid());

create policy "org member select" on organizations for select using(is_org_member(id));
create policy "org admin update" on organizations for update using(is_org_admin(id));

create policy "members view" on organization_members for select using(is_org_member(organization_id));
create policy "members admin insert" on organization_members for insert with check(is_org_admin(organization_id));
create policy "members admin update" on organization_members for update using(is_org_admin(organization_id));
create policy "members admin delete" on organization_members for delete using(is_org_admin(organization_id));

create policy "invitations admin all" on invitations for all
using(is_org_admin(organization_id))
with check(is_org_admin(organization_id));

create policy "contracts org access" on contracts for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

create policy "measurements org access" on measurements for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

create policy "addenda org access" on addenda for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

create policy "documents org access" on contract_documents for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

create policy "schedule org access" on schedule_items for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

create policy "tasks org access" on tasks for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

create policy "bids org access" on bids for all
using(is_org_member(organization_id))
with check(is_org_member(organization_id));

insert into storage.buckets(id,name,public)
values('contract-files','contract-files',false)
on conflict(id) do nothing;

create policy "contract files select" on storage.objects for select
using(
  bucket_id='contract-files' and
  exists(
    select 1
    from organization_members om
    where om.user_id=auth.uid()
      and om.status='active'
      and om.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "contract files insert" on storage.objects for insert
with check(
  bucket_id='contract-files' and
  exists(
    select 1
    from organization_members om
    where om.user_id=auth.uid()
      and om.status='active'
      and om.organization_id::text=(storage.foldername(name))[1]
  )
);

create policy "contract files delete" on storage.objects for delete
using(
  bucket_id='contract-files' and
  exists(
    select 1
    from organization_members om
    where om.user_id=auth.uid()
      and om.status='active'
      and om.organization_id::text=(storage.foldername(name))[1]
  )
);
