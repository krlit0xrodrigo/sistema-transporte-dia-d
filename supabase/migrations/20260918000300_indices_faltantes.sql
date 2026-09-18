-- =====================================================================
-- 0009 · Índices faltantes para mejorar el rendimiento de consultas
--
-- Se agregan índices en claves foráneas (chofer_id, persona_id, etc.)
-- que estaban causando escaneos secuenciales (seq scans) en las
-- consultas grandes como v_choferes_ficha.
-- =====================================================================

-- 1. Índice en asignaciones
create index if not exists ix_asignaciones_chofer 
  on asignaciones(chofer_id) 
  where vigente_hasta is null;

-- 2. Índice en choferes (persona)
create index if not exists ix_choferes_persona
  on choferes(persona_id)
  where deleted_at is null;

-- 3. Índice en contratos
create index if not exists ix_contratos_chofer
  on contratos(chofer_id)
  where estado <> 'anulado';

-- 4. Índice en anticipos
create index if not exists ix_anticipos_chofer
  on anticipos(chofer_id)
  where estado <> 'anulado';

-- 5. Índice en pagos finales
create index if not exists ix_pagos_finales_chofer
  on pagos_finales(chofer_id)
  where estado <> 'anulado';

-- 6. Índice en padrón electoral
create index if not exists ix_padron_snapshot
  on padron_electoral(snapshot_id, ci);
