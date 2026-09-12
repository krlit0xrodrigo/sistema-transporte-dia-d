-- =====================================================================
-- 0005 · Funciones de negocio (RPC)
--
-- La integridad que importa vive acá, no en TypeScript: el Día D hay
-- concurrencia real y un "chequear y después insertar" en la aplicación
-- deja pasar sobre-cupo y folios repetidos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Verificación contra el padrón vigente
-- ---------------------------------------------------------------------
create or replace function fn_verificar_padron(p_ci text)
returns table (
  encontrado        boolean,
  ci                text,
  nombre_completo   text,
  local_votacion_id uuid,
  local_nombre      text,
  mesa              int,
  orden             int,
  direccion         text,
  partidos          text,
  seccional         text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ci text := fn_normalizar_ci(p_ci);
begin
  insert into accesos_sensibles(organizacion_id, usuario_id, recurso, accion, contexto)
  values (auth_organizacion_id(), auth.uid(), 'padron', 'consulta', jsonb_build_object('ci', v_ci));

  return query
  select true, p.ci, p.nombre_completo, p.local_votacion_id, l.nombre,
         p.mesa, p.orden, p.direccion, p.partidos, p.seccional
    from padron_electoral p
    join padron_snapshots s on s.id = p.snapshot_id and s.vigente
    left join locales_votacion l on l.id = p.local_votacion_id
   where p.ci = v_ci;

  if not found then
    return query select false, v_ci, null::text, null::uuid, null::text,
                        null::int, null::int, null::text, null::text, null::text;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Cupo en cascada (D-05): candidato Y barrio Y supervisor
-- ---------------------------------------------------------------------
create or replace function fn_consumir_cupo_cascada(
  p_eleccion_id   uuid,
  p_candidato_id  uuid,
  p_barrio_id     uuid,
  p_supervisor_id uuid,
  p_chofer_id     uuid,
  p_excepcion_id  uuid default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r        record;
  v_usado  int;
begin
  for r in
    select c.* from cupos c
     where c.eleccion_id = p_eleccion_id
       and ( (c.ambito = 'candidato'  and c.candidato_id  = p_candidato_id)
          or (c.ambito = 'barrio'     and c.barrio_id     = p_barrio_id)
          or (c.ambito = 'supervisor' and c.supervisor_id = p_supervisor_id)
          or  c.ambito = 'global' )
     order by c.ambito
     for update                       -- bloqueo de fila: sin esto hay sobre-cupo
  loop
    select coalesce(sum(m.delta), 0) into v_usado
      from cupo_movimientos m where m.cupo_id = r.id;

    if v_usado + 1 > r.limite and p_excepcion_id is null then
      raise exception 'CUPO_AGOTADO: ámbito % (límite %, usado %)', r.ambito, r.limite, v_usado
        using errcode = 'check_violation';
    end if;

    insert into cupo_movimientos(cupo_id, chofer_id, delta, motivo, excepcion_id, registrado_por)
    values (r.id, p_chofer_id, 1,
            case when p_excepcion_id is null then 'alta' else 'alta con excepción' end,
            p_excepcion_id, auth.uid());
  end loop;
end $$;

create or replace function fn_liberar_cupo(p_chofer_id uuid, p_motivo text default 'baja')
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into cupo_movimientos(cupo_id, chofer_id, delta, motivo, registrado_por)
  select distinct m.cupo_id, p_chofer_id, -1, p_motivo, auth.uid()
    from cupo_movimientos m
   where m.chofer_id = p_chofer_id
   group by m.cupo_id
  having coalesce(sum(m.delta), 0) > 0;
end $$;

-- ---------------------------------------------------------------------
-- Folios: el siguiente disponible, sin repetición bajo concurrencia
-- ---------------------------------------------------------------------
create or replace function fn_asignar_folio(
  p_serie_id uuid, p_documento_tipo documento_tipo, p_documento_id uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_folio uuid;
begin
  select f.id into v_folio
    from folios f
   where f.serie_id = p_serie_id and f.estado = 'disponible'
   order by f.numero
   for update skip locked                 -- dos cajeros a la vez, folios distintos
   limit 1;

  if v_folio is null then
    raise exception 'SERIE_AGOTADA: no quedan folios disponibles en la serie %', p_serie_id
      using errcode = 'check_violation';
  end if;

  update folios
     set estado = 'usado', documento_tipo = p_documento_tipo,
         documento_id = p_documento_id, usado_en = now(),
         asignado_a_usuario_id = auth.uid()
   where id = v_folio;

  return v_folio;
end $$;

-- ---------------------------------------------------------------------
-- Alta de chofer: toda la cadena de validaciones en una transacción
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Baja de chofer: libera cupo, no borra nada
-- ---------------------------------------------------------------------
create or replace function fn_baja_chofer(p_chofer_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not auth_tiene_permiso('choferes.baja') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;
  update asignaciones set vigente_hasta = now(), motivo_cambio = p_motivo
   where chofer_id = p_chofer_id and vigente_hasta is null;
  update choferes set estado = 'baja', dado_de_baja_en = now(),
                      motivo_baja = p_motivo, updated_by = auth.uid()
   where id = p_chofer_id;
  perform fn_liberar_cupo(p_chofer_id, 'baja: ' || p_motivo);
end $$;

-- ---------------------------------------------------------------------
-- Reasignación: cierra la vigente y abre otra. Nunca un UPDATE.
-- ---------------------------------------------------------------------
create or replace function fn_reasignar_chofer(
  p_chofer_id uuid, p_candidato_id uuid, p_barrio_id uuid,
  p_supervisor_id uuid, p_motivo text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_eleccion uuid;
begin
  if not auth_tiene_permiso('asignaciones.reasignar') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;
  select eleccion_id into v_eleccion from choferes where id = p_chofer_id;

  update asignaciones set vigente_hasta = now(), motivo_cambio = p_motivo
   where chofer_id = p_chofer_id and vigente_hasta is null;

  insert into asignaciones(chofer_id, eleccion_id, candidato_id, barrio_id, supervisor_id,
                           motivo_cambio, asignado_por)
  values (p_chofer_id, v_eleccion, p_candidato_id, p_barrio_id, p_supervisor_id, p_motivo, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Actividad diaria (D-04): activo = hubo movimiento. Sin umbral de km.
-- ---------------------------------------------------------------------
create or replace function fn_recalcular_actividad(
  p_eleccion_id uuid, p_fecha date, p_criterio text default 'v1_movimiento'
) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_filas int;
begin
  insert into actividad_diaria(chofer_id, eleccion_id, fecha, km_recorridos,
                               primer_evento, ultimo_evento, eventos_movimiento,
                               eventos_pasivos, clasificacion, criterio_version)
  select c.id, p_eleccion_id, p_fecha,
         coalesce(k.km, 0), e.primero, e.ultimo,
         coalesce(e.movimiento, 0), coalesce(e.pasivos, 0),
         case
           when d.id is null                        then 'sin_dispositivo'
           when e.total is null or e.total = 0      then 'sin_datos'
           when coalesce(e.movimiento,0) > 0        then 'activo'
           else 'inactivo'
         end::actividad_clase,
         p_criterio
    from choferes c
    left join dispositivos_gps d
           on d.chofer_id = c.id and d.eleccion_id = p_eleccion_id and d.estado <> 'baja'
    left join lateral (
      select count(*) as total,
             count(*) filter (where t.tipo ilike '%movimiento%' or coalesce(t.velocidad,0) > 3) as movimiento,
             count(*) filter (where t.tipo not ilike '%movimiento%' and coalesce(t.velocidad,0) <= 3) as pasivos,
             min(t.ocurrido_en) as primero, max(t.ocurrido_en) as ultimo
        from traccar_eventos t
       where t.dispositivo_id = d.id and t.ocurrido_en::date = p_fecha
    ) e on true
    left join lateral (
      select max((t.atributos->>'totalDistance')::numeric)
           - min((t.atributos->>'totalDistance')::numeric) as km
        from traccar_eventos t
       where t.dispositivo_id = d.id and t.ocurrido_en::date = p_fecha
         and t.atributos ? 'totalDistance'
    ) k on true
   where c.eleccion_id = p_eleccion_id and c.estado = 'activo' and c.deleted_at is null
  on conflict (chofer_id, fecha, criterio_version) do update
    set km_recorridos      = excluded.km_recorridos,
        primer_evento      = excluded.primer_evento,
        ultimo_evento      = excluded.ultimo_evento,
        eventos_movimiento = excluded.eventos_movimiento,
        eventos_pasivos    = excluded.eventos_pasivos,
        clasificacion      = excluded.clasificacion,
        calculado_en       = now();

  get diagnostics v_filas = row_count;
  return v_filas;
end $$;

-- ---------------------------------------------------------------------
-- Vista: consumo de cupos con semáforo
-- ---------------------------------------------------------------------
create or replace view v_cupos_consumo
with (security_invoker = true) as
select c.id, c.organizacion_id, c.eleccion_id, c.ambito, c.limite,
       c.candidato_id, c.barrio_id, c.supervisor_id,
       coalesce(cand.nombre_publico, b.nombre, s.alias, 'Global') as etiqueta,
       coalesce(sum(m.delta), 0)::int as usado,
       (c.limite - coalesce(sum(m.delta), 0))::int as disponible,
       case when c.limite = 0 then 0
            else round(100.0 * coalesce(sum(m.delta),0) / c.limite, 1) end as porcentaje
  from cupos c
  left join cupo_movimientos m on m.cupo_id = c.id
  left join candidatos   cand on cand.id = c.candidato_id
  left join barrios      b    on b.id    = c.barrio_id
  left join supervisores s    on s.id    = c.supervisor_id
 group by c.id, c.candidato_id, c.barrio_id, c.supervisor_id,
          cand.nombre_publico, b.nombre, s.alias;

-- ---------------------------------------------------------------------
-- Vista: ficha de chofer con padrón, responsable y apariciones
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
       ad.km_recorridos
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
