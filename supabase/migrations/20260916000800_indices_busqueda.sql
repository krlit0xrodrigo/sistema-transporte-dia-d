-- =====================================================================
-- 0008 · Índices para la búsqueda de personas, filtro operativo, y la
--        columna `origen_planilla_id` expuesta en la ficha.
--
-- Sólo agrega índices y añade una columna a una vista. No toca datos, ni
-- columnas de tablas, ni políticas, ni funciones. Es seguro aplicarla en
-- cualquier momento.
--
-- POR QUÉ CADA UNO
-- ----------------
-- 1. `ux_personas_ci` es un btree sobre (organizacion_id, ci), pero con la
--    colación por defecto de Supabase (en_US.UTF-8) NO sirve para
--    `ci like '436%'`. El autocompletado por cédula escribe prefijos, así
--    que necesita `text_pattern_ops`, que ordena byte a byte y sí resuelve
--    el prefijo con un index scan.
--
-- 2. La búsqueda por nombre y por apellido es de coincidencia EXACTA y
--    sensible a mayúsculas y acentos (decisión del operativo: «José» no es
--    «Jose»). Un btree común sobre la columna alcanza y es exacto.
--
-- 3. El trigrama sobre `nombre_completo` ya existía; se agrega el de
--    `apellidos` para la búsqueda parcial opcional, que es una acción
--    explícita del usuario, nunca el comportamiento por defecto.
--
-- 4. El índice parcial sobre `choferes` es el que hace barata la consulta
--    del operativo actual: las altas de la aplicación son las que tienen
--    `origen_planilla_id` nulo.
-- =====================================================================

-- 1. Prefijo de cédula para el autocompletado.
create index if not exists ix_personas_ci_prefijo
  on personas (organizacion_id, ci text_pattern_ops)
  where deleted_at is null;

-- 2. Coincidencia exacta por apellido y por nombre.
create index if not exists ix_personas_apellidos
  on personas (organizacion_id, apellidos)
  where deleted_at is null;

create index if not exists ix_personas_nombres
  on personas (organizacion_id, nombres)
  where deleted_at is null;

-- 3. Búsqueda parcial opcional por apellido.
create index if not exists ix_personas_apellidos_trgm
  on personas using gin (apellidos gin_trgm_ops);

-- 4. El operativo actual: altas de la aplicación en la elección vigente.
create index if not exists ix_choferes_operativo
  on choferes (eleccion_id, estado)
  where deleted_at is null and origen_planilla_id is null;

-- Y su complemento, el histórico importado.
create index if not exists ix_choferes_importados
  on choferes (eleccion_id, origen_planilla_id)
  where deleted_at is null and origen_planilla_id is not null;

-- ---------------------------------------------------------------------
-- 5. La ficha expone el origen de la participación.
--
--    `origen_planilla_id` nulo  = alta hecha desde la aplicación,
--                                 o sea operación actual.
--    `origen_planilla_id` lleno = vino de una planilla importada,
--                                 o sea histórico.
--
--    Se agregan también `numero_orden` y `fecha_alta`, que la planilla
--    impresa necesita y antes obligaban a una segunda consulta.
--    `create or replace view` sólo permite AGREGAR columnas al final:
--    las existentes quedan intactas y en el mismo orden.
-- ---------------------------------------------------------------------
create or replace view v_choferes_ficha
with (security_invoker = true) as
select ch.id                     as chofer_id,
       ch.organizacion_id, ch.eleccion_id, ch.estado, ch.estado_servicio,
       p.id                      as persona_id,
       p.ci, p.nombre_completo, p.telefono_e164,
       p.verificado_en_padron, p.estado_identidad,
       cand.nombre_publico       as candidato,
       b.nombre                  as barrio,
       s.alias                   as supervisor,
       coalesce(rsup.alias, rcand.nombre_publico) as responsable,
       case when rsup.id is not null then 'supervisor' else 'concejal' end as responsable_tipo,
       v.chapa, v.categoria,
       (select count(*) from apariciones_origen ao
         where ao.persona_id = p.id and ao.eleccion_id = ch.eleccion_id) as apariciones,
       co.firmado                as contrato_firmado,
       vc.entregado              as vale_entregado,
       an.pagado                 as anticipo_pagado,
       pf.finalizado             as pago_finalizado,
       ad.clasificacion          as actividad,
       ad.km_recorridos,
       -- Nuevas (0008): permiten separar la operación actual del
       -- histórico importado sin una consulta extra.
       ch.origen_planilla_id,
       ch.numero_orden,
       ch.fecha_alta
  from choferes ch
  join personas p        on p.id = ch.persona_id
  left join supervisores rsup on rsup.id = ch.responsable_supervisor_id
  left join candidatos  rcand on rcand.id = ch.responsable_candidato_id
  left join asignaciones a on a.chofer_id = ch.id and a.vigente_hasta is null
  left join candidatos   cand on cand.id = a.candidato_id
  left join barrios      b    on b.id = a.barrio_id
  left join supervisores s    on s.id = a.supervisor_id
  left join chofer_vehiculos cv on cv.chofer_id = ch.id and cv.hasta is null
  left join vehiculos    v    on v.id = cv.vehiculo_id
  left join contratos    co   on co.chofer_id = ch.id and co.estado <> 'anulado'
  left join vales_combustible vc on vc.chofer_id = ch.id and vc.estado <> 'anulado'
  left join anticipos    an   on an.chofer_id = ch.id and an.estado <> 'anulado'
  left join pagos_finales pf  on pf.chofer_id = ch.id and pf.estado <> 'anulado'
  left join actividad_diaria ad on ad.chofer_id = ch.id
 where ch.deleted_at is null;
