-- =====================================================================
-- 0015 · Corrección de Alta Chofer (Restaurar original + bypass)
--
-- Se restaura la lógica original completa de `fn_alta_chofer` 
-- (consumo de cupo en cascada, auditorías, apariciones_origen, etc.)
-- y se le inyectan los dos cambios recientes:
-- 1. Info en duplicado (candidato, supervisor, barrio)
-- 2. Bypass de lista negra con motivo.
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
  
  if v_forzar and v_motivo is null then
    raise exception 'MOTIVO_OBLIGATORIO: debes ingresar un motivo para justificar esta alta bajo tu responsabilidad.'
      using errcode = 'check_violation';
  end if;

  select * into v_persona from (select id from personas
     where organizacion_id = v_org and ci = v_ci and deleted_at is null) q;

  -- Duplicado en la misma elección: bloqueo duro, mostrando quién lo dio de alta
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

  -- Antecedentes negativos (comportamiento igual a lista negra)
  if v_persona is not null and exists (
      select 1 from antecedentes a
       where a.persona_id = v_persona
         and a.resultado = 'no_cumplio'
  ) and v_excepcion is null and not v_forzar then
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
  
  if v_forzar then
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'lista_negra_aprobada', 
      'aprobado_por', auth.uid(), 
      'motivo', coalesce(v_motivo, 'No especificado')
    );
  end if;

  -- Persona (upsert original)
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

  -- Chofer (original)
  insert into choferes(organizacion_id, persona_id, eleccion_id, estado_servicio, estado,
                       origen_planilla_id, declarado_por,
                       responsable_supervisor_id, responsable_candidato_id, created_by,
                       metadata)
  values (v_org, v_persona, v_eleccion,
          coalesce((p->>'estado_servicio')::estado_servicio, 'pendiente'), 'activo',
          nullif(p->>'origen_planilla_id','')::uuid, auth.uid(),
          nullif(p->>'responsable_supervisor_id','')::uuid,
          nullif(p->>'responsable_candidato_id','')::uuid, auth.uid(),
          case when jsonb_array_length(v_alertas) > 0 then jsonb_build_object('alertas_alta', v_alertas) else '{}'::jsonb end)
  returning id into v_chofer;

  -- Vehículo (opcional original)
  if nullif(p->>'chapa','') is not null then
    insert into vehiculos(organizacion_id, chapa, categoria, marca, modelo)
    values (v_org, upper(replace(p->>'chapa',' ','')),
            nullif(p->>'categoria','')::vehiculo_categoria, p->>'marca', p->>'modelo')
    on conflict (organizacion_id, chapa) where chapa is not null and deleted_at is null
      do update set marca = coalesce(excluded.marca, vehiculos.marca),
                    modelo = coalesce(excluded.modelo, vehiculos.modelo),
                    categoria = coalesce(excluded.categoria, vehiculos.categoria)
    returning id into v_vehiculo;

    insert into chofer_vehiculos(chofer_id, vehiculo_id) values (v_chofer, v_vehiculo);
  end if;

  -- Asignación (original)
  insert into asignaciones(chofer_id, eleccion_id, candidato_id, barrio_id, supervisor_id, asignado_por)
  values (v_chofer, v_eleccion, (p->>'candidato_id')::uuid,
          nullif(p->>'barrio_id','')::uuid, nullif(p->>'supervisor_id','')::uuid, auth.uid());

  -- Cupo en cascada (original)
  perform fn_consumir_cupo_cascada(v_eleccion, (p->>'candidato_id')::uuid,
            nullif(p->>'barrio_id','')::uuid, nullif(p->>'supervisor_id','')::uuid,
            v_chofer, v_excepcion);

  -- D-03: la aparición queda archivada, aplicada o no (original)
  insert into apariciones_origen(organizacion_id, persona_id, eleccion_id, origen_planilla_id,
                                 nombre_texto, candidato_texto, barrio_texto, supervisor_texto,
                                 fue_aplicada)
  values (v_org, v_persona, v_eleccion, nullif(p->>'origen_planilla_id','')::uuid,
          btrim(coalesce(upper(p->>'nombres'),'') || ' ' || coalesce(upper(p->>'apellidos'),'')),
          p->>'candidato_texto', p->>'barrio_texto', p->>'supervisor_texto', true);

  -- Retornamos el id (con 'ok': true extra, por compatibilidad con el frontend si la esperaba)
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
