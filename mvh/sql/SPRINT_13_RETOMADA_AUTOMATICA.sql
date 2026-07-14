-- EngHub Sprint 13 — Retomada automática
-- Não cria novas tabelas.
-- Apenas recarrega o schema da API.

notify pgrst, 'reload schema';
