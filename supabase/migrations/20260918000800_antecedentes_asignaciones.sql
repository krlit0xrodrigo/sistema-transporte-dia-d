-- =====================================================================
-- 0014 · Vistas: Incluir candidato/supervisor/barrio en antecedentes
--
-- Modifica v_antecedentes para extraer y mostrar con quién operó 
-- (o quién lo registró) en esa elección pasada.
-- Busca tanto en la operación real (choferes/asignaciones) como
-- en el historial de importación (apariciones_origen).
-- =====================================================================

drop view if exists v_antecedentes cascade;

create or replace view v_antecedentes
with (security_invoker = true) as
select a.id, a.organizacion_id, a.eleccion_id, a.persona_id,
       p.ci, p.nombre_completo,
       el.nombre as eleccion_nombre, el.fecha as eleccion_fecha,
       a.rol, a.resultado, a.km_recorridos, a.tuvo_gps,
       a.anticipo_pagado, a.pago_finalizado, a.incidentes,
       a.confiabilidad_dato, a.fuente, a.created_at,
       coalesce(nullif(op.op_candidatos, ''), ao.candidatos) as candidato_historico,
       coalesce(nullif(op.op_supervisores, ''), ao.supervisores) as supervisor_historico,
       coalesce(nullif(op.op_barrios, ''), ao.barrios) as barrio_historico
  from antecedentes a
  join personas p on p.id = a.persona_id
  join elecciones el on el.id = a.eleccion_id
  left join lateral (
     select string_agg(distinct candidato_texto, ' / ') as candidatos,
            string_agg(distinct supervisor_texto, ' / ') as supervisores,
            string_agg(distinct barrio_texto, ' / ') as barrios
       from apariciones_origen ao_t
      where ao_t.persona_id = a.persona_id and ao_t.eleccion_id = a.eleccion_id
  ) ao on true
  left join lateral (
     select string_agg(distinct rcand.nombre_publico, ' / ') as op_candidatos,
            string_agg(distinct rsup.alias, ' / ') as op_supervisores,
            string_agg(distinct b.nombre, ' / ') as op_barrios
       from choferes c
       left join asignaciones asig on asig.chofer_id = c.id
       left join candidatos rcand on rcand.id = asig.candidato_id
       left join supervisores rsup on rsup.id = asig.supervisor_id
       left join barrios b on b.id = asig.barrio_id
      where c.persona_id = a.persona_id and c.eleccion_id = a.eleccion_id
        and c.estado <> 'baja'
  ) op on true;
