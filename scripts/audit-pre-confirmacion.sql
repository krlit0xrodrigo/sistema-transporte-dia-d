-- =====================================================================
-- AUDITORIA PRE-CONFIRMACION
-- sistema-transporte-dia-d
--
-- Uso:
--   psql "$env:DATABASE_URL" -f scripts/audit-pre-confirmacion.sql
--
-- SEGURIDAD:
--   La transaccion es READ ONLY.
--   El script termina con ROLLBACK.
--   No modifica datos, estructura, permisos ni configuracion.
--
-- OBJETIVO:
--   Verificar que la base esta en condiciones seguras antes de
--   confirmar una importacion de choferes.
--
-- IMPORTANTE:
--   Este archivo NO contiene CIs, nombres de personas, UUIDs de usuarios,
--   hashes de archivos ni cantidades fijas de una importacion concreta.
-- =====================================================================

\set ON_ERROR_STOP on
\pset pager off
\timing off

BEGIN;
SET TRANSACTION READ ONLY;

\echo ''
\echo '====================================================================='
\echo ' AUDITORIA PRE-CONFIRMACION - sistema-transporte-dia-d'
\echo '====================================================================='
\echo ''

-- =====================================================================
-- 0. CONTEXTO
-- =====================================================================

\echo '--- 0. CONTEXTO ---'

SELECT
    o.codigo AS organizacion,
    o.nombre AS organizacion_nombre,
    e.nombre AS eleccion,
    e.fecha,
    e.estado
FROM organizaciones o
LEFT JOIN elecciones e
       ON e.organizacion_id = o.id
WHERE o.codigo = 'dia-d-vh'
ORDER BY e.fecha;

-- =====================================================================
-- 1. ESTADO ACTUAL DEL DOMINIO
-- =====================================================================

\echo ''
\echo '--- 1. ESTADO ACTUAL DEL DOMINIO ---'

WITH org AS (
    SELECT id
    FROM organizaciones
    WHERE codigo = 'dia-d-vh'
),
ele AS (
    SELECT id
    FROM elecciones
    WHERE organizacion_id = (SELECT id FROM org)
      AND estado = 'activa'
    ORDER BY fecha DESC
    LIMIT 1
)
SELECT 'personas' AS tabla,
       count(*) AS cantidad
FROM personas
WHERE organizacion_id = (SELECT id FROM org)

UNION ALL

SELECT 'choferes',
       count(*)
FROM choferes
WHERE organizacion_id = (SELECT id FROM org)

UNION ALL

SELECT 'asignaciones',
       count(*)
FROM asignaciones
WHERE eleccion_id = (SELECT id FROM ele)

UNION ALL

SELECT 'asignaciones vigentes',
       count(*)
FROM asignaciones
WHERE eleccion_id = (SELECT id FROM ele)
  AND vigente_hasta IS NULL

UNION ALL

SELECT 'apariciones_origen',
       count(*)
FROM apariciones_origen
WHERE organizacion_id = (SELECT id FROM org)

UNION ALL

SELECT 'chofer_vehiculos',
       count(*)
FROM chofer_vehiculos cv
WHERE EXISTS (
    SELECT 1
    FROM choferes c
    WHERE c.id = cv.chofer_id
      AND c.organizacion_id = (SELECT id FROM org)
)

UNION ALL

SELECT 'vehiculos',
       count(*)
FROM vehiculos
WHERE organizacion_id = (SELECT id FROM org)

UNION ALL

SELECT 'supervisores',
       count(*)
FROM supervisores
WHERE organizacion_id = (SELECT id FROM org);

-- =====================================================================
-- 2. IMPORTACIONES RECIENTES
-- =====================================================================

\echo ''
\echo '--- 2. IMPORTACIONES RECIENTES ---'

SELECT
    i.id,
    i.archivo_nombre,
    left(i.archivo_hash, 12) || '...' AS hash,
    i.hoja,
    i.estado,
    i.filas_totales,
    i.filas_ok,
    i.filas_error,
    i.filas_conflicto,
    i.confirmado_en,
    i.created_at
FROM importaciones i
JOIN origenes_planilla op
  ON op.id = i.origen_planilla_id
WHERE op.codigo = 'logistica_dia_d_choferes'
ORDER BY i.created_at DESC
LIMIT 10;

-- =====================================================================
-- 3. IMPORTACIONES CONFIRMADAS
-- =====================================================================

\echo ''
\echo '--- 3. IMPORTACIONES CONFIRMADAS ---'

SELECT
    count(*) AS importaciones_confirmadas
FROM importaciones i
JOIN origenes_planilla op
  ON op.id = i.origen_planilla_id
WHERE op.codigo = 'logistica_dia_d_choferes'
  AND i.estado = 'confirmado';

SELECT
    i.id,
    i.archivo_nombre,
    i.hoja,
    i.estado,
    i.filas_totales,
    i.filas_ok,
    i.filas_error,
    i.filas_conflicto,
    i.confirmado_en
FROM importaciones i
JOIN origenes_planilla op
  ON op.id = i.origen_planilla_id
WHERE op.codigo = 'logistica_dia_d_choferes'
  AND i.estado = 'confirmado'
ORDER BY i.confirmado_en DESC
LIMIT 5;

-- =====================================================================
-- 4. IMPORTACIONES EN ESTADO VALIDADO
-- =====================================================================

\echo ''
\echo '--- 4. IMPORTACIONES PENDIENTES DE CONFIRMACION ---'

SELECT
    i.id,
    i.archivo_nombre,
    i.hoja,
    i.estado,
    i.filas_totales,
    i.filas_ok,
    i.filas_error,
    i.filas_conflicto,
    i.created_at
FROM importaciones i
JOIN origenes_planilla op
  ON op.id = i.origen_planilla_id
WHERE op.codigo = 'logistica_dia_d_choferes'
  AND i.estado = 'validado'
ORDER BY i.created_at DESC;

-- =====================================================================
-- 5. METRICAS DE LA ULTIMA IMPORTACION VALIDADA
-- =====================================================================

\echo ''
\echo '--- 5. METRICAS DE LA ULTIMA IMPORTACION ---'

WITH ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT
    count(*) AS filas_staging,
    count(*) FILTER (WHERE estado = 'ok') AS filas_ok,
    count(*) FILTER (WHERE estado = 'error') AS filas_error,
    count(*) FILTER (WHERE estado = 'rechazada') AS filas_rechazadas,
    count(*) FILTER (WHERE estado = 'conflicto') AS filas_conflicto,
    count(DISTINCT (datos_normalizados->>'ci'))
        FILTER (WHERE (datos_normalizados->>'ci') IS NOT NULL) AS ci_distintos,
    count(DISTINCT (datos_normalizados->>'ci'))
        FILTER (WHERE (datos_normalizados->>'ci') IS NOT NULL)
        - count(DISTINCT (datos_normalizados->>'ci'))
        FILTER (
            WHERE (datos_normalizados->>'ci') IS NOT NULL
            AND estado = 'ok'
        ) AS ci_con_repeticion_o_conflicto
FROM importacion_filas
WHERE importacion_id = (SELECT id FROM ultima);
-- 6. DISTRIBUCION DE ESTADOS DEL STAGING
-- =====================================================================

\echo ''
\echo '--- 6. DISTRIBUCION DE ESTADOS ---'

WITH ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT
    estado,
    count(*) AS cantidad
FROM importacion_filas
WHERE importacion_id = (SELECT id FROM ultima)
GROUP BY estado
ORDER BY estado;

-- =====================================================================
-- 7. DUPLICADOS POR CI
-- =====================================================================

\echo ''
\echo '--- 7. CIs REPETIDAS EN EL STAGING ---'

WITH ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
),
repetidos AS (
    SELECT (datos_normalizados->>'ci')
    FROM importacion_filas
    WHERE importacion_id = (SELECT id FROM ultima)
      AND (datos_normalizados->>'ci') IS NOT NULL
    GROUP BY (datos_normalizados->>'ci')
    HAVING count(*) > 1
)
SELECT count(*) AS cIs_repetidas
FROM repetidos;

-- =====================================================================
-- 8. CONFLICTOS ENTRE CANDIDATOS
-- =====================================================================

\echo ''
\echo '--- 8. CIs ASOCIADAS A MAS DE UN CANDIDATO ---'

WITH ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT count(*) AS cis_multicandidato
FROM (
    SELECT (datos_normalizados->>'ci')
    FROM importacion_filas
    WHERE importacion_id = (SELECT id FROM ultima)
      AND (datos_normalizados->>'ci') IS NOT NULL
    GROUP BY (datos_normalizados->>'ci')
    HAVING count(DISTINCT (datos_normalizados->>'candidato_id')) > 1
) x;

-- =====================================================================
-- 9. FILAS SIN IDENTIDAD SEGURA
-- =====================================================================

\echo ''
\echo '--- 9. FILAS SIN IDENTIDAD SEGURA ---'

WITH ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT
    count(*) FILTER (
        WHERE (datos_normalizados->>'ci') IS NULL
    ) AS sin_ci,

    count(*) FILTER (
        WHERE (datos_normalizados->>'candidato_id') IS NULL
    ) AS sin_candidato,

    count(*) FILTER (
        WHERE estado = 'conflicto'
    ) AS conflictos
FROM importacion_filas
WHERE importacion_id = (SELECT id FROM ultima);

-- =====================================================================
-- 10. CAPACIDAD PARA INSERTAR PERSONAS
-- =====================================================================

\echo ''
\echo '--- 10. POSIBLES COLISIONES CON PERSONAS EXISTENTES ---'

WITH org AS (
    SELECT id
    FROM organizaciones
    WHERE codigo = 'dia-d-vh'
),
ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT count(DISTINCT f.datos_normalizados->>'ci') AS ci_ya_existentes
FROM importacion_filas f
JOIN personas p
  ON p.organizacion_id = (SELECT id FROM org)
 AND p.ci = f.datos_normalizados->>'ci'
WHERE f.importacion_id = (SELECT id FROM ultima)
  AND f.estado = 'ok'
  AND f.datos_normalizados->>'ci' IS NOT NULL
  AND p.deleted_at IS NULL;

-- =====================================================================
-- 11. POSIBLES COLISIONES CON CHOFERES
-- =====================================================================

\echo ''
\echo '--- 11. POSIBLES COLISIONES CON CHOFERES ---'

WITH org AS (
    SELECT id
    FROM organizaciones
    WHERE codigo = 'dia-d-vh'
),
ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT count(DISTINCT p.id) AS choferes_ya_existentes
FROM importacion_filas f
JOIN personas p
  ON p.organizacion_id = (SELECT id FROM org)
 AND p.ci = f.datos_normalizados->>'ci'
JOIN choferes c
  ON c.persona_id = p.id
WHERE f.importacion_id = (SELECT id FROM ultima)
  AND f.estado = 'ok'
  AND f.datos_normalizados->>'ci' IS NOT NULL
  AND p.deleted_at IS NULL
  AND c.estado <> 'baja';

-- =====================================================================
-- 12. ASIGNACIONES VIGENTES
-- =====================================================================

\echo ''
\echo '--- 12. POSIBLES COLISIONES DE ASIGNACION ---'

WITH org AS (
    SELECT id
    FROM organizaciones
    WHERE codigo = 'dia-d-vh'
),
ele AS (
    SELECT id
    FROM elecciones
    WHERE organizacion_id = (SELECT id FROM org)
      AND estado = 'activa'
    ORDER BY fecha DESC
    LIMIT 1
),
ultima AS (
    SELECT i.id
    FROM importaciones i
    JOIN origenes_planilla op
      ON op.id = i.origen_planilla_id
    WHERE op.codigo = 'logistica_dia_d_choferes'
      AND i.estado IN ('validado', 'confirmado')
    ORDER BY i.created_at DESC
    LIMIT 1
)
SELECT count(DISTINCT c.id) AS choferes_con_asignacion_vigente
FROM importacion_filas f
JOIN personas p
  ON p.organizacion_id = (SELECT id FROM org)
 AND p.ci = f.datos_normalizados->>'ci'
JOIN choferes c
  ON c.persona_id = p.id
JOIN asignaciones a
  ON a.chofer_id = c.id
WHERE f.importacion_id = (SELECT id FROM ultima)
  AND f.estado = 'ok'
  AND a.eleccion_id = (SELECT id FROM ele)
  AND a.vigente_hasta IS NULL;

-- =====================================================================
-- 13. CANDIDATOS
-- =====================================================================

\echo ''

\echo ''
\echo '--- 13. CANDIDATOS DE LA ELECCION ACTIVA ---'

SELECT
    c.id,
    c.nombre_publico,
    c.apodo,
    c.lista,
    c.orden_lista,
    c.preferenciales,
    c.activo
FROM candidatos c
JOIN elecciones e
  ON e.id = c.eleccion_id
JOIN organizaciones o
  ON o.id = e.organizacion_id
WHERE o.codigo = 'dia-d-vh'
  AND e.estado = 'activa'
  AND c.deleted_at IS NULL
ORDER BY c.orden_lista NULLS LAST, c.nombre_publico;

-- =====================================================================
-- 14. RLS
-- =====================================================================

\echo ''
\echo '--- 14. TABLAS CON RLS ---'

SELECT
    count(*) AS tablas_con_rls
FROM pg_class c
JOIN pg_namespace n
  ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relrowsecurity = true;

-- =====================================================================
-- 15. POLITICAS RLS
-- =====================================================================

\echo ''
\echo '--- 15. POLITICAS RLS ---'

SELECT
    count(*) AS politicas_rls
FROM pg_policies
WHERE schemaname = 'public';

-- =====================================================================
-- 16. INDICES CRITICOS DE INTEGRIDAD
-- =====================================================================

\echo ''
\echo '--- 16. INDICES / RESTRICCIONES CRITICAS ---'

SELECT
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'ux_personas_ci',
      'ux_chofer_persona_eleccion',
      'ux_asignacion_vigente',
      'ux_vehiculo_activo'
  )
ORDER BY indexname;

-- =====================================================================
-- 17. RESTRICCIONES DE INTEGRIDAD
-- =====================================================================

\echo ''
\echo '--- 17. RESTRICCIONES DE INTEGRIDAD ---'

SELECT
    conrelid::regclass AS tabla,
    conname AS restriccion,
    contype
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND contype IN ('p','u','f','c')
ORDER BY conrelid::regclass::text, conname;

-- =====================================================================
-- 18. RESULTADO FINAL
-- =====================================================================

\echo ''
\echo '====================================================================='
\echo ' RESULTADO'
\echo '====================================================================='
\echo ''
\echo 'La auditoria anterior es informativa y NO modifica la base.'
\echo ''
\echo 'Antes de confirmar una importacion se debe verificar manualmente:'
\echo '  1. La importacion correcta esta en estado validado.'
\echo '  2. Las filas conflicto/error fueron revisadas.'
\echo '  3. No existen colisiones inesperadas con personas.'
\echo '  4. No existen colisiones inesperadas con choferes.'
\echo '  5. No existen asignaciones vigentes incompatibles.'
\echo '  6. Los candidatos corresponden a la eleccion activa.'
\echo '  7. RLS y restricciones de integridad siguen presentes.'
\echo '  8. El script de importacion es idempotente.'
\echo ''

ROLLBACK;

\echo '====================================================================='
\echo ' Transaccion cerrada con ROLLBACK. No se modifico ninguna fila.'
\echo '====================================================================='
