-- =====================================================================
-- 0010 · Alta de chofer: Aprobar excepción de lista negra/antecedentes
--        directamente desde la carga (forzar alta).
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
  v_forzar_alta boolean := coalesce((p->>'aprobar_lista_negra')::boolean, false);
  v_persona    uuid;
  v_chofer     uuid;
  v_vehiculo   uuid;
  v_padron     record;
  v_estado_id  estado_identidad;
  v_alertas    jsonb := '[]'::jsonb;
begin
  if not auth_tiene_permiso('choferes.crear') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  -- D-18: sin CI no hay alta. Punto.
  if v_ci is null then
    raise exception 'CI_OBLIGATORIO: la cǸdula es obligatoria y debe ser numǸrica'
      using errcode = 'check_violation';
  end if;

  -- RN-16: todo chofer tiene responsable declarado (supervisor o concejal)
  if nullif(p->>'responsable_supervisor_id','') is null
     and nullif(p->>'responsable_candidato_id','') is null then
    raise exception 'RESPONSABLE_OBLIGATORIO: indicǭ el supervisor o concejal que responde por este chofer'
      using errcode = 'check_violation';
  end if;

  select * into v_persona from (select id from personas
     where organizacion_id = v_org and ci = v_ci and deleted_at is null) q;

  -- Duplicado en la misma elección: bloqueo duro
  if v_persona is not null and exists (
      select 1 from choferes c
       where c.persona_id = v_persona and c.eleccion_id = v_eleccion
         and c.deleted_at is null and c.estado <> 'baja') then
    raise exception 'CHOFER_DUPLICADO: el CI % ya tiene una participacin activa en esta eleccin', v_ci
      using errcode = 'unique_violation';
  end if;

  -- Lista negra vigente
  if v_persona is not null and exists (
      select 1 from lista_negra l
       where l.persona_id = v_persona
         and l.severidad = 'bloqueo_total'
         and l.revocado_en is null
         and l.vigente_desde <= now()
         and (l.vigente_hasta is null or l.vigente_hasta > now()))
     and v_excepcion is null and not v_forzar_alta then
    raise exception 'LISTA_NEGRA: la persona estǭ bloqueada. Requiere excepcin aprobada.'
      using errcode = 'check_violation';
  end if;

  -- Antecedentes negativos (comportamiento igual a lista negra)
  if v_persona is not null and exists (
      select 1 from antecedentes a
       where a.persona_id = v_persona
         and a.resultado = 'no_cumplio'
  ) and v_excepcion is null and not v_forzar_alta then
    raise exception 'LISTA_NEGRA: la persona tiene antecedentes negativos (no cumpli). Requiere excepcin aprobada.'
      using errcode = 'check_violation';
  end if;

  -- Padrón (D-21: no bloquea, marca)
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

  -- Upsert Persona
  if v_persona is null then
    insert into personas (organizacion_id, ci, nombres, apellidos, telefono_e164, estado_identidad)
    values (v_org, v_ci, upper(p->>'nombres'), upper(p->>'apellidos'), v_tel, v_estado_id)
    returning id into v_persona;
  else
    update personas
       set nombres = upper(p->>'nombres'),
           apellidos = upper(p->>'apellidos'),
           telefono_e164 = coalesce(v_tel, telefono_e164),
           estado_identidad = v_estado_id,
           verificado_en_padron = v_padron.encontrado,
           updated_at = now()
     where id = v_persona;
  end if;

  -- Validar y consumir cupo si hay candidato y no tiene cupo ilimitado
  if nullif(p->>'candidato_id','') is not null and not exists (
       select 1 from candidatos where id = (p->>'candidato_id')::uuid and cupo_ilimitado = true
     ) then
     
    -- Buscar cupo disponible (global o por barrio)
    declare
      v_cupo record;
    begin
      select * into v_cupo from cupos c 
       where c.candidato_id = (p->>'candidato_id')::uuid 
         and (c.barrio_id = (p->>'barrio_id')::uuid or (c.barrio_id is null and nullif(p->>'barrio_id','') is null))
         and c.estado = 'activo';
         
      if not found or v_cupo.usado >= v_cupo.cantidad then
        raise exception 'CUPO_AGOTADO: no hay cupo disponible para este candidato en este barrio.' using errcode = 'check_violation';
      end if;
      
      -- Reservar el cupo incrementando el uso
      update cupos set usado = usado + 1 where id = v_cupo.id;
    end;
  end if;

  -- Insertar Chofer
  insert into choferes (
    organizacion_id, eleccion_id, persona_id,
    responsable_candidato_id, responsable_supervisor_id,
    estado_servicio
  ) values (
    v_org, v_eleccion, v_persona,
    nullif(p->>'responsable_candidato_id','')::uuid,
    nullif(p->>'responsable_supervisor_id','')::uuid,
    (p->>'estado_servicio')::estado_servicio
  ) returning id into v_chofer;

  -- D-14: Asignación actual (barrio, candidato, etc.)
  insert into asignaciones (chofer_id, eleccion_id, candidato_id, barrio_id, supervisor_id)
  values (
    v_chofer, v_eleccion,
    nullif(p->>'candidato_id','')::uuid,
    nullif(p->>'barrio_id','')::uuid,
    nullif(p->>'supervisor_id','')::uuid
  );

  -- Vehículo opcional
  if nullif(p->>'chapa','') is not null then
    insert into vehiculos (organizacion_id, chapa, categoria, marca, modelo)
    values (v_org, upper(p->>'chapa'), nullif(p->>'categoria','')::categoria_vehiculo, upper(p->>'marca'), upper(p->>'modelo'))
    on conflict (organizacion_id, chapa) do update
       set categoria = excluded.categoria,
           marca = excluded.marca,
           modelo = excluded.modelo
    returning id into v_vehiculo;

    insert into chofer_vehiculos (chofer_id, vehiculo_id) values (v_chofer, v_vehiculo);
  end if;

  -- Registrar alertas si hubo discrepancias o forzado
  if jsonb_array_length(v_alertas) > 0 or v_forzar_alta then
    if v_forzar_alta then
      v_alertas := v_alertas || jsonb_build_object('tipo', 'lista_negra_aprobada', 'aprobado_por', auth.uid());
    end if;
    update choferes set metadata = jsonb_build_object('alertas_alta', v_alertas) where id = v_chofer;
  end if;

  return jsonb_build_object('ok', true, 'chofer_id', v_chofer);
end;
$$;
