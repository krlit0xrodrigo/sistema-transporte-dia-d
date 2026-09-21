-- 20260920150000_tarifas_por_vehiculo.sql

-- 1. Agregar nueva columna JSONB para guardar tarifas por vehículo
alter table elecciones 
add column if not exists tarifas_vehiculos jsonb default '{}'::jsonb;

-- 2. Modificar el RPC para guardar el JSON directamente
create or replace function fn_guardar_montos_caja(
  p_eleccion_id uuid,
  p_tarifas_vehiculos jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  -- Solo usuarios autenticados
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update elecciones
     set tarifas_vehiculos = p_tarifas_vehiculos,
         updated_at = now()
   where id = p_eleccion_id;
end;
$$;

-- 3. Actualizar la vista v_caja para incluir vehiculo_categoria y estado_servicio
drop view if exists v_caja cascade;

create or replace view v_caja
with (security_invoker = true) as
select ch.id                          as chofer_id,
       ch.organizacion_id, ch.eleccion_id,
       p.ci, p.nombre_completo,
       cand.nombre_publico            as candidato,
       sup.alias                      as supervisor,
       b.nombre                       as barrio,
       coalesce(co.firmado, false)    as contrato_firmado,
       co.fecha_firma,
       coalesce(vc.entregado, false)  as vale_entregado,
       coalesce(an.pagado, false)     as anticipo_pagado,
       coalesce(pf.finalizado, false) as pago_finalizado,
       pf.autorizado_por,
       ad.clasificacion               as actividad,
       -- Info del vehículo
       trim(coalesce(v.marca || ' ' || coalesce(v.modelo, ''), v.categoria::text)) as vehiculo,
       v.categoria                    as vehiculo_categoria,
       ch.estado_servicio
  from choferes ch
  join personas p on p.id = ch.persona_id
  left join asignaciones a on a.chofer_id = ch.id and a.vigente_hasta is null
  left join candidatos cand on cand.id = a.candidato_id
  left join supervisores sup on sup.id = a.supervisor_id
  left join barrios b on b.id = a.barrio_id
  left join contratos co on co.chofer_id = ch.id and co.estado <> 'anulado'
  left join vales_combustible vc on vc.chofer_id = ch.id and vc.estado <> 'anulado'
  left join anticipos an on an.chofer_id = ch.id and an.estado <> 'anulado'
  left join pagos_finales pf on pf.chofer_id = ch.id and pf.estado <> 'anulado'
  left join actividad_diaria ad on ad.chofer_id = ch.id
  left join chofer_vehiculos cv on cv.chofer_id = ch.id and cv.hasta is null
  left join vehiculos v on v.id = cv.vehiculo_id
 where ch.deleted_at is null and ch.estado = 'activo';
