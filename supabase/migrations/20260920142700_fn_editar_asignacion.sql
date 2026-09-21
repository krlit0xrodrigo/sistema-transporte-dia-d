-- Editar asignación de chofer con validación de cupos y orden correlativo
create or replace function fn_editar_asignacion_chofer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_chofer_id       uuid := (p->>'chofer_id')::uuid;
  v_candidato_id    uuid := (p->>'candidato_id')::uuid;
  v_supervisor_id   uuid := nullif(p->>'supervisor_id','')::uuid;
  v_barrio_id       uuid := nullif(p->>'barrio_id','')::uuid;
  v_estado_servicio text := p->>'estado_servicio';
  
  v_eleccion_id     uuid;
  v_old_candidato   uuid;
  v_old_supervisor  uuid;
  v_old_barrio      uuid;
  v_is_assignment_changed boolean;
  v_nuevo_nro_orden int;
begin
  -- 1. Validar autenticación
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO' using errcode = 'insufficient_privilege';
  end if;

  -- 2. Obtener asignación actual
  select eleccion_id, candidato_id, supervisor_id, barrio_id 
    into v_eleccion_id, v_old_candidato, v_old_supervisor, v_old_barrio
  from asignaciones
  where chofer_id = v_chofer_id and vigente_hasta is null;

  if not found then
    raise exception 'ASIGNACION_NO_ENCONTRADA: El chofer no tiene una asignación vigente.'
      using errcode = 'no_data_found';
  end if;

  v_is_assignment_changed := v_old_candidato is distinct from v_candidato_id 
                          or v_old_supervisor is distinct from v_supervisor_id 
                          or v_old_barrio is distinct from v_barrio_id;

  -- 3. Si hubo cambio de asignación, liberar cupos antiguos y consumir los nuevos
  if v_is_assignment_changed then
    -- Liberar cupos
    perform fn_liberar_cupo(v_chofer_id, 'reasignacion_manual');

    -- Consumir nuevos cupos (lanzará excepción si no hay cupo)
    perform fn_consumir_cupo_cascada(
      v_eleccion_id,
      v_candidato_id,
      v_barrio_id,
      v_supervisor_id,
      v_chofer_id,
      null -- sin excepcion
    );

    -- Calcular nuevo número de orden para el nuevo candidato
    select coalesce(max(c.numero_orden), 0) + 1 into v_nuevo_nro_orden
    from choferes c
    join asignaciones a on a.chofer_id = c.id
    where a.candidato_id = v_candidato_id
      and c.eleccion_id = v_eleccion_id
      and c.deleted_at is null;

    -- Cerrar asignación anterior
    update asignaciones
    set vigente_hasta = now(),
        motivo_cambio = 'Reasignación desde UI'
    where chofer_id = v_chofer_id and vigente_hasta is null;

    -- Insertar nueva asignación
    insert into asignaciones(chofer_id, eleccion_id, candidato_id, supervisor_id, barrio_id, asignado_por)
    values (v_chofer_id, v_eleccion_id, v_candidato_id, v_supervisor_id, v_barrio_id, auth.uid());
  end if;

  -- 4. Actualizar estado y número de orden si corresponde
  update choferes
  set estado_servicio = coalesce(v_estado_servicio::estado_servicio, estado_servicio),
      numero_orden = coalesce(v_nuevo_nro_orden, numero_orden)
  where id = v_chofer_id;

  return jsonb_build_object('ok', true);
end;
$$;
