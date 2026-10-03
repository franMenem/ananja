-- ============================================================
-- Realtime: habilita INSERT en `notificaciones` para el badge de la
-- campana (US5 — ver contracts/database.md § Realtime).
-- ============================================================

alter publication supabase_realtime add table notificaciones;
