-- EngHub Sprint 26 — Estabilização de organização e dossiês
-- Não altera dados automaticamente.

notify pgrst, 'reload schema';

-- Diagnóstico opcional:
-- select user_id, organization_id, role, status
-- from public.organization_members
-- order by created_at desc;

-- select id, organization_id
-- from public.profiles
-- where organization_id is not null;
