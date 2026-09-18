create or replace function fn_alta_chofer(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org        uuid := auth_organizacion_id();
  v_eleccion   uuid := coalesce((p->>'eleccion_id')::uuid, auth_eleccion_actual());
  v_ci         text := fn_normalizar_ci(p->>'ci');
  v_tel        text := fn_normalizar_telefono(p->>'telefono');
  v_excepcion  uuid := nullif(p->>'excepcion_id','')::uuid;
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
    raise exception 'CI_OBLIGATORIO: la cédula es obligatoria y debe ser numérica'
      using errcode = 'check_violation';
  end if;

  -- RN-16: todo chofer tiene responsable declarado (supervisor o concejal)
  if nullif(p->>'responsable_supervisor_id','') is null
     and nullif(p->>'responsable_candidato_id','') is null then
    raise exception 'RESPONSABLE_OBLIGATORIO: indicá el supervisor o concejal que responde por este chofer'
      using errcode = 'check_violation';
  end if;

  select * into v_persona from (select id from personas
     where organizacion_id = v_org and ci = v_ci and deleted_at is null) q;

  -- Duplicado en la misma elección: bloqueo duro
  if v_persona is not null and exists (
      select 1 from choferes c
       where c.persona_id = v_persona and c.eleccion_id = v_eleccion
         and c.deleted_at is null and c.estado <> 'baja') then
    raise exception 'CHOFER_DUPLICADO: el CI % ya tiene una participación activa en esta elección', v_ci
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
     and v_excepcion is null then
    raise exception 'LISTA_NEGRA: la persona está bloqueada. Requiere excepción aprobada.'
      using errcode = 'check_violation';
  end if;

  -- Antecedentes negativos (comportamiento igual a lista negra)
  if v_persona is not null and exists (
      select 1 from antecedentes a
       where a.persona_id = v_persona
         and a.resultado = 'no_cumplio'
  ) and v_excepcion is null then
    raise exception 'LISTA_NEGRA: la persona tiene antecedentes negativos (no cumplió). Requiere excepción aprobada.'
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

  -- Persona (upsert)
  if v_persona is null then
    insert into personas(organizacion_id, ci, ci_original, nombres, apellidos,
                         telefono_e164, telefono_original, padron_ci,
                         verificado_en_padron, estado_identidad, created_by)
    values (v_org, v_ci, p->>'ci', p->>'nombres', coalesce(p->>'apellidos',''),
            v_tel, p->>'telefono', case when v_padron.encontrado then v_ci end,
            coalesce(v_padron.encontrado,false), v_estado_id, auth.uid())
    returning id into v_persona;
  else
    update personas
       set telefono_e164 = coalesce(v_tel, telefono_e164),
           verificado_en_padron = coalesce(v_padron.encontrado,false),
           estado_identidad = v_estado_id,
           updated_by = auth.uid()
     where id = v_persona;
  end if;

  -- Chofer
  insert into choferes(organizacion_id, persona_id, eleccion_id, estado_servicio, estado,
                       origen_planilla_id, declarado_por,
                       responsable_supervisor_id, responsable_candidato_id, created_by)
  values (v_org, v_persona, v_eleccion,
          coalesce((p->>'estado_servicio')::estado_servicio, 'pendiente'), 'activo',
          nullif(p->>'origen_planilla_id','')::uuid, auth.uid(),
          nullif(p->>'responsable_supervisor_id','')::uuid,
          nullif(p->>'responsable_candidato_id','')::uuid, auth.uid())
  returning id into v_chofer;

  -- Vehículo (opcional)
  if nullif(p->>'chapa','') is not null then
    insert into vehiculos(organizacion_id, chapa, categoria, marca, modelo)
    values (v_org, upper(replace(p->>'chapa',' ','')),
            nullif(p->>'categoria','')::vehiculo_categoria, p->>'marca', p->>'modelo')
    on conflict (organizacion_id, chapa) where chapa is not null and deleted_at is null
      do update set marca = coalesce(excluded.marca, vehiculos.marca)
    returning id into v_vehiculo;

    insert into chofer_vehiculos(chofer_id, vehiculo_id) values (v_chofer, v_vehiculo);
  end if;

  -- Asignación
  insert into asignaciones(chofer_id, eleccion_id, candidato_id, barrio_id, supervisor_id, asignado_por)
  values (v_chofer, v_eleccion, (p->>'candidato_id')::uuid,
          nullif(p->>'barrio_id','')::uuid, nullif(p->>'supervisor_id','')::uuid, auth.uid());

  -- Cupo en cascada
  perform fn_consumir_cupo_cascada(v_eleccion, (p->>'candidato_id')::uuid,
            nullif(p->>'barrio_id','')::uuid, nullif(p->>'supervisor_id','')::uuid,
            v_chofer, v_excepcion);

  -- D-03: la aparición queda archivada, aplicada o no
  insert into apariciones_origen(organizacion_id, persona_id, eleccion_id, origen_planilla_id,
                                 nombre_texto, candidato_texto, barrio_texto, supervisor_texto,
                                 fue_aplicada)
  values (v_org, v_persona, v_eleccion, nullif(p->>'origen_planilla_id','')::uuid,
          btrim(coalesce(p->>'nombres','') || ' ' || coalesce(p->>'apellidos','')),
          p->>'candidato_texto', p->>'barrio_texto', p->>'supervisor_texto', true);

  return jsonb_build_object(
    'chofer_id', v_chofer, 'persona_id', v_persona,
    'estado_identidad', v_estado_id, 'alertas', v_alertas,
    'padron', case when v_padron.encontrado
                   then jsonb_build_object('local', v_padron.local_nombre,
                                           'mesa', v_padron.mesa, 'orden', v_padron.orden)
              end);
end $$;
