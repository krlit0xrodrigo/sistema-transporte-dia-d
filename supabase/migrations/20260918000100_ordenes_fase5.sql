-- -----------------------------------------------------------------------------
-- Funciones de Órdenes de Trabajo (Fase 5)
-- -----------------------------------------------------------------------------

create or replace function fn_asignar_orden_masivo(p_eleccion_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_max_orden int;
  v_asignados int := 0;
  v_chofer record;
begin
  -- 1. Permiso
  if not auth_tiene_permiso('asignaciones.editar') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  -- 2. Bloquear la elección para concurrencia
  perform 1 from elecciones where id = p_eleccion_id for update;

  -- 3. Buscar máximo orden actual
  select coalesce(max(numero_orden), 0) into v_max_orden
  from choferes
  where eleccion_id = p_eleccion_id;

  -- 4. Iterar sobre choferes sin orden, asignando uno
  for v_chofer in 
    select id 
    from choferes 
    where eleccion_id = p_eleccion_id 
      and numero_orden is null
      and estado_servicio != 'pendiente'
      and estado != 'baja'
    order by fecha_alta asc
  loop
    v_max_orden := v_max_orden + 1;
    
    update choferes
    set numero_orden = v_max_orden
    where id = v_chofer.id;
    
    v_asignados := v_asignados + 1;
  end loop;

  return v_asignados;
end;
$$;

-- Vista para imprimir planillas
create or replace view v_planillas_impresion
with (security_invoker = true) as
select c.id as chofer_id,
       c.organizacion_id,
       c.eleccion_id,
       c.numero_orden,
       c.estado_servicio,
       v.chapa,
       v.marca,
       v.modelo,
       p.ci,
       p.nombre_completo as nombre,
       p.telefono_original as telefono,
       sup.alias as supervisor_nombre,
       cand.nombre_publico as candidato_nombre,
       b.nombre as barrio_nombre
from choferes c
join personas p on p.id = c.persona_id
left join asignaciones a on a.chofer_id = c.id and a.vigente_hasta is null
left join supervisores sup on sup.id = a.supervisor_id
left join candidatos cand on cand.id = a.candidato_id
left join barrios b on b.id = a.barrio_id
left join chofer_vehiculos cv on cv.chofer_id = c.id and cv.hasta is null
left join vehiculos v on v.id = cv.vehiculo_id
where c.numero_orden is not null
  and c.estado != 'baja'
order by cand.nombre_publico, sup.alias, b.nombre, c.numero_orden;
