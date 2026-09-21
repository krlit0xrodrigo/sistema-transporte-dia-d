-- =====================================================================
-- 20260921115048_chofer_voluntario_sin_cupo.sql
-- Modifica fn_alta_chofer y fn_editar_asignacion_chofer para que 
-- los choferes voluntarios (o pendientes) NO consuman cupos.
-- =====================================================================

create or replace function fn_alta_chofer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org        uuid := auth_organizacion_id();
  v_eleccion   uuid := coalesce((p->>'eleccion_id')::uuid, auth_eleccion_actual());
  v_ci         text := fn_normalizar_ci(p->>'ci');
  v_tel        text := fn_normalizar_telefono(p->>'telefono');
  v_excepcion  uuid := nullif(p->>'excepcion_id','')::uuid;
  v_forzar     boolean := coalesce((p->>'aprobar_lista_negra')::boolean, false);
  v_motivo     text := nullif(trim(p->>'motivo_excepcion'), '');
  v_estado_srv estado_servicio := coalesce((p->>'estado_servicio')::estado_servicio, 'pendiente');
  v_persona    uuid;
  v_chofer     uuid;
  v_vehiculo   uuid;
  v_padron     record;
  v_estado_id  estado_identidad;
  v_alertas    jsonb := '[]'::jsonb;
  v_nro_orden  int;
begin
  if not auth_tiene_permiso('choferes.crear') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  if v_ci is null then
    raise exception 'CI_OBLIGATORIO: la cédula es obligatoria y debe ser numérica'
      using errcode = 'check_violation';
  end if;

  if nullif(p->>'responsable_supervisor_id','') is null
     and nullif(p->>'responsable_candidato_id','') is null then
    raise exception 'RESPONSABLE_OBLIGATORIO: indicá el supervisor o concejal que responde por este chofer'
      using errcode = 'check_violation';
  end if;
  
  if v_forzar and v_motivo is null then
    raise exception 'MOTIVO_OBLIGATORIO: debes ingresar un motivo para justificar esta alta bajo tu responsabilidad.'
      using errcode = 'check_violation';
  end if;

  select * into v_persona from (select id from personas
     where organizacion_id = v_org and ci = v_ci and deleted_at is null) q;

  -- Bloqueo de Duplicados
  if v_persona is not null then
    declare
      v_dup_candidato text;
      v_dup_supervisor text;
      v_dup_barrio text;
      v_dup_msg text;
    begin
      select rcand.nombre_publico, rsup.alias, b.nombre 
        into v_dup_candidato, v_dup_supervisor, v_dup_barrio
        from choferes c
        left join asignaciones a on a.chofer_id = c.id and a.vigente_hasta is null
        left join candidatos rcand on rcand.id = a.candidato_id
        left join supervisores rsup on rsup.id = a.supervisor_id
        left join barrios b on b.id = a.barrio_id
       where c.persona_id = v_persona and c.eleccion_id = v_eleccion 
         and c.deleted_at is null and c.estado <> 'baja' limit 1;

      if found then
        v_dup_msg := concat_ws(' - ', 
          nullif('Candidato: ' || coalesce(v_dup_candidato, ''), 'Candidato: '),
          nullif('Supervisor: ' || coalesce(v_dup_supervisor, ''), 'Supervisor: '),
          nullif('Barrio: ' || coalesce(v_dup_barrio, ''), 'Barrio: ')
        );
        raise exception 'CHOFER_DUPLICADO: %', coalesce(nullif(v_dup_msg, ''), 'Ya registrado')
          using errcode = 'unique_violation';
      end if;
    end;
  end if;

  -- Lista negra vigente
  if v_persona is not null and exists (
      select 1 from lista_negra l
       where l.persona_id = v_persona
         and l.severidad = 'bloqueo_total'
         and l.revocado_en is null
         and l.vigente_desde <= now()
         and (l.vigente_hasta is null or l.vigente_hasta > now()))
     and v_excepcion is null and not v_forzar then
    raise exception 'LISTA_NEGRA: la persona está bloqueada. Requiere excepción aprobada.'
      using errcode = 'check_violation';
  end if;

  -- Antecedentes negativos
  if v_persona is not null and exists (
      select 1 from antecedentes a
       where a.persona_id = v_persona
         and a.resultado = 'no_cumplio'
  ) and v_excepcion is null and not v_forzar then
    raise exception 'LISTA_NEGRA: la persona tiene antecedentes negativos (no cumplió). Requiere excepción aprobada.'
      using errcode = 'check_violation';
  end if;

  -- Padrón
  select * into v_padron from fn_verificar_padron(v_ci) limit 1;
  if v_padron.encontrado then
    if fn_normalizar_nombre(v_padron.nombre_completo)
       ilike '%' || split_part(fn_normalizar_nombre(p->>'apellidos'), ' ', 1) || '%' then
      v_estado_id := 'verificada';
    else
      v_estado_id := 'discrepancia_nombre';
      v_alertas := v_alertas || jsonb_build_object('tipo','discrepancia_nombre','padron', v_padron.nombre_completo);
    end if;
  else
    v_estado_id := 'fuera_de_padron';
    v_alertas := v_alertas || jsonb_build_object('tipo','fuera_de_padron');
  end if;

  -- Persona
  if v_persona is null then
    insert into personas(organizacion_id, ci, ci_original, nombres, apellidos,
                         telefono_e164, telefono_original, padron_ci,
                         verificado_en_padron, estado_identidad, created_by)
    values (v_org, v_ci, p->>'ci', upper(p->>'nombres'), coalesce(upper(p->>'apellidos'),''),
            v_tel, p->>'telefono', case when v_padron.encontrado then v_ci end,
            coalesce(v_padron.encontrado,false), v_estado_id, auth.uid())
    returning id into v_persona;
  else
    update personas
       set telefono_e164 = coalesce(v_tel, telefono_e164),
           verificado_en_padron = coalesce(v_padron.encontrado,false),
           estado_identidad = v_estado_id,
           nombres = upper(p->>'nombres'),
           apellidos = upper(p->>'apellidos'),
           updated_by = auth.uid()
     where id = v_persona;
  end if;
  
  if v_forzar then
    insert into excepciones(organizacion_id, persona_id, eleccion_id, tipo, motivo, 
                            solicitado_por, aprobado_por, aprobado_en, estado)
    values (v_org, v_persona, v_eleccion, 'lista_negra', v_motivo,
            auth.uid(), auth.uid(), now(), 'aprobada')
    returning id into v_excepcion;
  end if;

  -- ==============================================================
  -- NUEVO: Calcular nro de orden por candidato (solo para esta elección)
  -- ==============================================================
  select coalesce(max(c.numero_orden), 0) + 1 into v_nro_orden
  from choferes c
  join asignaciones a on a.chofer_id = c.id
  where a.candidato_id = (p->>'candidato_id')::uuid
    and c.eleccion_id = v_eleccion
    and c.deleted_at is null;

  -- Chofer
  insert into choferes(organizacion_id, persona_id, eleccion_id, estado_servicio, estado,
                       origen_planilla_id, declarado_por,
                       responsable_supervisor_id, responsable_candidato_id, created_by,
                       observaciones, numero_orden)
  values (v_org, v_persona, v_eleccion,
          v_estado_srv, 'activo',
          nullif(p->>'origen_planilla_id','')::uuid, auth.uid(),
          nullif(p->>'responsable_supervisor_id','')::uuid,
          nullif(p->>'responsable_candidato_id','')::uuid, auth.uid(),
          case when jsonb_array_length(v_alertas) > 0 then 'Alertas Alta: ' || v_alertas::text else null end,
          v_nro_orden)
  returning id into v_chofer;
  
  if v_forzar then
    update excepciones set chofer_id = v_chofer where id = v_excepcion;
  end if;

  -- Vehículo
  if nullif(p->>'chapa','') is not null then
    insert into vehiculos(organizacion_id, chapa, categoria, marca, modelo)
    values (v_org, upper(replace(p->>'chapa',' ','')),
            nullif(p->>'categoria','')::vehiculo_categoria, p->>'marca', p->>'modelo')
    on conflict (organizacion_id, chapa) where chapa is not null and deleted_at is null
      do update set marca = coalesce(excluded.marca, vehiculos.marca),
                    modelo = coalesce(excluded.modelo, vehiculos.modelo),
                    categoria = coalesce(excluded.categoria, vehiculos.categoria)
    returning id into v_vehiculo;

    if exists (select 1 from chofer_vehiculos where vehiculo_id = v_vehiculo and hasta is null) then
      raise exception 'VEHICULO_EN_USO: La chapa % ya está asignada a otro chofer activo. Da de baja al anterior primero.', upper(replace(p->>'chapa',' ',''))
        using errcode = 'unique_violation';
    end if;

    insert into chofer_vehiculos(chofer_id, vehiculo_id) values (v_chofer, v_vehiculo);
  end if;

  -- Asignación
  insert into asignaciones(chofer_id, eleccion_id, candidato_id, barrio_id, supervisor_id, asignado_por)
  values (v_chofer, v_eleccion, (p->>'candidato_id')::uuid,
          nullif(p->>'barrio_id','')::uuid, nullif(p->>'supervisor_id','')::uuid, auth.uid());

  -- Cupo en cascada: SOLO SI ES CONTRATADO
  if v_estado_srv = 'contratado' then
    perform fn_consumir_cupo_cascada(v_eleccion, (p->>'candidato_id')::uuid,
              nullif(p->>'barrio_id','')::uuid, nullif(p->>'supervisor_id','')::uuid,
              v_chofer, v_excepcion);
  end if;

  -- Apariciones origen
  insert into apariciones_origen(organizacion_id, persona_id, eleccion_id, origen_planilla_id,
                                 nombre_texto, candidato_texto, barrio_texto, supervisor_texto,
                                 fue_aplicada)
  values (v_org, v_persona, v_eleccion, nullif(p->>'origen_planilla_id','')::uuid,
          btrim(coalesce(upper(p->>'nombres'),'') || ' ' || coalesce(upper(p->>'apellidos'),'')),
          p->>'candidato_texto', p->>'barrio_texto', p->>'supervisor_texto', true);

  return jsonb_build_object(
    'ok', true,
    'chofer_id', v_chofer, 'persona_id', v_persona,
    'estado_identidad', v_estado_id, 'alertas', v_alertas,
    'padron', case when v_padron.encontrado
                   then jsonb_build_object('local', v_padron.local_nombre,
                                           'mesa', v_padron.mesa, 'orden', v_padron.orden)
              end);
end;
$$;


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
  v_old_estado_srv  text;
  v_new_estado_srv  text;
  v_is_assignment_changed boolean;
  v_is_state_changed boolean;
  v_nuevo_nro_orden int;
begin
  -- 1. Validar autenticación
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO' using errcode = 'insufficient_privilege';
  end if;

  -- 2. Obtener asignación actual
  select a.eleccion_id, a.candidato_id, a.supervisor_id, a.barrio_id, c.estado_servicio
    into v_eleccion_id, v_old_candidato, v_old_supervisor, v_old_barrio, v_old_estado_srv
  from asignaciones a
  join choferes c on c.id = a.chofer_id
  where a.chofer_id = v_chofer_id and a.vigente_hasta is null;

  if not found then
    raise exception 'ASIGNACION_NO_ENCONTRADA: El chofer no tiene una asignación vigente.'
      using errcode = 'no_data_found';
  end if;

  v_new_estado_srv := coalesce(v_estado_servicio, v_old_estado_srv);
  v_is_assignment_changed := v_old_candidato is distinct from v_candidato_id 
                          or v_old_supervisor is distinct from v_supervisor_id 
                          or v_old_barrio is distinct from v_barrio_id;
  v_is_state_changed := v_old_estado_srv is distinct from v_new_estado_srv;

  -- 3. Si hubo cambio de asignación o estado, manejar cupos
  if v_is_assignment_changed or v_is_state_changed then
    -- Liberar cupos (fn_liberar_cupo es seguro, solo revierte lo que este chofer consumió)
    perform fn_liberar_cupo(v_chofer_id, 'reasignacion_manual_o_estado');

    -- Consumir nuevos cupos SOLO SI el nuevo estado es contratado
    if v_new_estado_srv = 'contratado' then
      perform fn_consumir_cupo_cascada(
        v_eleccion_id,
        v_candidato_id,
        v_barrio_id,
        v_supervisor_id,
        v_chofer_id,
        null -- sin excepcion
      );
    end if;

    -- Si cambió de asignación (de candidato específicamente u otro factor), manejamos la tabla asignaciones
    if v_is_assignment_changed then
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
  end if;

  -- 4. Actualizar estado y número de orden si corresponde
  update choferes
  set estado_servicio = v_new_estado_srv::estado_servicio,
      numero_orden = coalesce(v_nuevo_nro_orden, numero_orden)
  where id = v_chofer_id;

  return jsonb_build_object('ok', true);
end;
$$;
