-- =====================================================================
-- 0021 · Optimización RLS v_antecedentes
--
-- Quita security_invoker = true de la vista y filtra manualmente por 
-- organizacion_id para evitar que PostgreSQL evalúe las políticas RLS
-- de todas las tablas subyacentes por cada fila, lo cual causa timeouts.
-- =====================================================================

create or replace view v_antecedentes as
select a.id, a.organizacion_id, a.eleccion_id, a.persona_id,
       p.ci, p.nombre_completo,
       el.nombre as eleccion_nombre, el.fecha as eleccion_fecha,
       a.rol, a.resultado, a.km_recorridos, a.tuvo_gps,
       a.anticipo_pagado, a.pago_finalizado, a.incidentes,
       a.confiabilidad_dato, a.fuente, a.created_at,
       coalesce(nullif(op.op_candidatos, ''), ao.candidatos) as candidato_historico,
       coalesce(nullif(op.op_supervisores, ''), ao.supervisores) as supervisor_historico,
       coalesce(nullif(op.op_barrios, ''), ao.barrios) as barrio_historico,
       coalesce(p.telefono_e164, p.telefono_original) as telefono,
       veh.marca as vehiculo_marca,
       veh.modelo as vehiculo_modelo,
       veh.chapa as vehiculo_chapa
  from antecedentes a
  join personas p on p.id = a.persona_id
  join elecciones el on el.id = a.eleccion_id
  -- Join con apariciones
  left join (
     select ao_t.persona_id, ao_t.eleccion_id,
            string_agg(distinct candidato_texto, ' / ') as candidatos,
            string_agg(distinct supervisor_texto, ' / ') as supervisores,
            string_agg(distinct barrio_texto, ' / ') as barrios
       from apariciones_origen ao_t
      group by ao_t.persona_id, ao_t.eleccion_id
  ) ao on ao.persona_id = a.persona_id and ao.eleccion_id = a.eleccion_id
  -- Join con choferes (operativos)
  left join (
     select c.persona_id, c.eleccion_id,
            string_agg(distinct rcand.nombre_publico, ' / ') as op_candidatos,
            string_agg(distinct rsup.alias, ' / ') as op_supervisores,
            string_agg(distinct b.nombre, ' / ') as op_barrios
       from choferes c
       left join asignaciones asig on asig.chofer_id = c.id
       left join candidatos rcand on rcand.id = asig.candidato_id
       left join supervisores rsup on rsup.id = asig.supervisor_id
       left join barrios b on b.id = asig.barrio_id
      where c.estado <> 'baja'
      group by c.persona_id, c.eleccion_id
  ) op on op.persona_id = a.persona_id and op.eleccion_id = a.eleccion_id
  -- Join con vehiculos
  left join (
     select distinct on (c.persona_id, c.eleccion_id)
            c.persona_id, c.eleccion_id,
            v.marca, v.modelo, v.chapa
       from choferes c
       join chofer_vehiculos cv on cv.chofer_id = c.id
       join vehiculos v on v.id = cv.vehiculo_id
      where c.estado <> 'baja'
      order by c.persona_id, c.eleccion_id, c.created_at desc
  ) veh on veh.persona_id = a.persona_id and veh.eleccion_id = a.eleccion_id
  where a.organizacion_id = auth_organizacion_id()
    and auth_tiene_permiso('choferes.ver');
