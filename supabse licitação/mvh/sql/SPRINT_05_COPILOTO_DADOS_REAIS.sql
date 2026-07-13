
-- EngHub Sprint 05 — Copiloto conectado aos dados reais

create table if not exists public.copilot_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.copilot_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.copilot_conversations enable row level security;
alter table public.copilot_messages enable row level security;

drop policy if exists "copilot conversations own access"
on public.copilot_conversations;

create policy "copilot conversations own access"
on public.copilot_conversations for all
using (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
)
with check (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
);

drop policy if exists "copilot messages own access"
on public.copilot_messages;

create policy "copilot messages own access"
on public.copilot_messages for all
using (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
)
with check (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
);

create index if not exists idx_copilot_conversations_user_updated
on public.copilot_conversations(user_id, updated_at desc);

create index if not exists idx_copilot_messages_conversation_created
on public.copilot_messages(conversation_id, created_at);

create index if not exists idx_copilot_messages_rate_limit
on public.copilot_messages(user_id, role, created_at desc);
