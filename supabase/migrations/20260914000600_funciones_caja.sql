-- =====================================================================
-- 0006 · Folios y caja: funciones de negocio
--
-- Las reglas de secuencia viven acá y no en la aplicación. Si estuvieran
-- en TypeScript, alguien podría emitir un vale sin contrato llamando a la
-- API directamente con la anon key.
--
-- Reglas implementadas (docs/workflows.md §6.2):
--   C1  ningún documento existe sin folio cuando hay serie disponible
--   C2  sin contrato firmado no hay vale ni anticipo
--   C3  el pago final de un chofer sin actividad requiere excepción
--   C4  quien autoriza no es quien marca el pago
--   C5  toda marca lleva fecha y usuario
--   C6  un folio anulado no se reutiliza
--   C7  doble pago imposible (índice único, ya existente)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Serie de folios: crea la serie y sus folios en una sola sentencia.
-- ---------------------------------------------------------------------
create or replace function fn_crear_serie_folios(
  p_tipo     documento_tipo,
  p_desde    int,
  p_hasta    int,
  p_prefijo  text default ''
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org    uuid := auth_organizacion_id();
  v_elec   uuid := auth_eleccion_actual();
  v_serie  uuid;
begin
  if not auth_tiene_permiso('folios.emitir_serie') then
    raise exception 'SIN_PERMISO: no podés emitir series de folios'
      using errcode = 'insufficient_privilege';
  end if;
  if p_hasta < p_desde or p_desde < 1 then
    raise exception 'RANGO_INVALIDO: el rango % a % no es válido', p_desde, p_hasta
      using errcode = 'check_violation';
  end if;
  if p_hasta - p_desde > 100000 then
    raise exception 'RANGO_EXCESIVO: máximo 100.000 folios por serie'
      using errcode = 'check_violation';
  end if;

  insert into folios_series(organizacion_id, eleccion_id, tipo_documento,
                            prefijo, desde, hasta, asignado_a_usuario_id, estado)
  values (v_org, v_elec, p_tipo, coalesce(p_prefijo, ''), p_desde, p_hasta,
          auth.uid(), 'disponible')
  returning id into v_serie;

  insert into folios(serie_id, numero)
  select v_serie, g from generate_series(p_desde, p_hasta) g;

  return v_serie;
end $$;

-- ---------------------------------------------------------------------
-- Anulación de folio. C6: no se reutiliza, queda el motivo.
-- ---------------------------------------------------------------------
create or replace function fn_anular_folio(p_folio_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not auth_tiene_permiso('folios.anular') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'MOTIVO_OBLIGATORIO: una anulación sin motivo no es auditable'
      using errcode = 'check_violation';
  end if;

  update folios
     set estado = 'anulado', anulado_en = now(), motivo_anulacion = p_motivo
   where id = p_folio_id and estado <> 'usado';

  if not found then
    raise exception 'FOLIO_NO_ANULABLE: no existe o ya está usado por un documento'
      using errcode = 'check_violation';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Helper: siguiente serie con folios disponibles para un tipo.
-- ---------------------------------------------------------------------
create or replace function fn_serie_disponible(p_tipo documento_tipo)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id from folios_series s
   where s.organizacion_id = auth_organizacion_id()
     and s.eleccion_id = auth_eleccion_actual()
     and s.tipo_documento = p_tipo
     and s.estado in ('disponible', 'en_uso')
     and exists (select 1 from folios f where f.serie_id = s.id and f.estado = 'disponible')
   order by s.desde limit 1
$$;

-- ---------------------------------------------------------------------
-- Contrato firmado. D-09: es una marca con fecha y responsable.
-- ---------------------------------------------------------------------
create or replace function fn_registrar_contrato(p_chofer_id uuid, p_monto numeric default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := auth_organizacion_id();
  v_elec uuid; v_contrato uuid; v_serie uuid; v_folio uuid;
begin
  if not auth_tiene_permiso('contratos.firmar') then
    raise exception 'SIN_PERMISO: no podés firmar contratos'
      using errcode = 'insufficient_privilege';
  end if;

  select eleccion_id into v_elec from choferes
   where id = p_chofer_id and organizacion_id = v_org and deleted_at is null;
  if v_elec is null then
    raise exception 'CHOFER_INEXISTENTE' using errcode = 'no_data_found';
  end if;

  select id into v_contrato from contratos
   where chofer_id = p_chofer_id and estado <> 'anulado';

  if v_contrato is null then
    v_serie := fn_serie_disponible('contrato');
    insert into contratos(organizacion_id, chofer_id, eleccion_id, monto_acordado)
    values (v_org, p_chofer_id, v_elec, p_monto)
    returning id into v_contrato;

    if v_serie is not null then
      v_folio := fn_asignar_folio(v_serie, 'contrato', v_contrato);
      update contratos set folio_id = v_folio where id = v_contrato;
    end if;
  end if;

  update contratos
     set firmado = true, fecha_firma = now(), registrado_por = auth.uid(),
         estado = 'firmado', monto_acordado = coalesce(p_monto, monto_acordado)
   where id = v_contrato and not firmado;

  return jsonb_build_object('contrato_id', v_contrato, 'folio_id', v_folio);
end $$;

-- ---------------------------------------------------------------------
-- Vale de combustible. C2: exige contrato firmado.
-- ---------------------------------------------------------------------
create or replace function fn_entregar_vale(
  p_chofer_id uuid, p_monto numeric default null, p_litros numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := auth_organizacion_id();
  v_elec uuid; v_vale uuid; v_serie uuid; v_folio uuid;
begin
  if not auth_tiene_permiso('caja.entregar_vale') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  select eleccion_id into v_elec from choferes
   where id = p_chofer_id and organizacion_id = v_org and deleted_at is null;
  if v_elec is null then
    raise exception 'CHOFER_INEXISTENTE' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from contratos
                  where chofer_id = p_chofer_id and firmado and estado <> 'anulado') then
    raise exception 'SIN_CONTRATO: no se entrega vale sin contrato firmado'
      using errcode = 'check_violation';
  end if;

  v_serie := fn_serie_disponible('vale_combustible');
  insert into vales_combustible(organizacion_id, chofer_id, eleccion_id,
                                entregado, fecha_entrega, entregado_por,
                                monto, litros, estado)
  values (v_org, p_chofer_id, v_elec, true, now(), auth.uid(), p_monto, p_litros, 'entregado')
  returning id into v_vale;

  if v_serie is not null then
    v_folio := fn_asignar_folio(v_serie, 'vale_combustible', v_vale);
    update vales_combustible set folio_id = v_folio where id = v_vale;
  end if;

  return jsonb_build_object('vale_id', v_vale, 'folio_id', v_folio);
end $$;

-- ---------------------------------------------------------------------
-- Anticipo. C2: exige contrato firmado.
-- ---------------------------------------------------------------------
create or replace function fn_registrar_anticipo(p_chofer_id uuid, p_monto numeric default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := auth_organizacion_id();
  v_elec uuid; v_anticipo uuid; v_serie uuid; v_folio uuid;
begin
  if not auth_tiene_permiso('caja.marcar_anticipo') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  select eleccion_id into v_elec from choferes
   where id = p_chofer_id and organizacion_id = v_org and deleted_at is null;
  if v_elec is null then
    raise exception 'CHOFER_INEXISTENTE' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from contratos
                  where chofer_id = p_chofer_id and firmado and estado <> 'anulado') then
    raise exception 'SIN_CONTRATO: no se paga anticipo sin contrato firmado'
      using errcode = 'check_violation';
  end if;

  select id into v_anticipo from anticipos
   where chofer_id = p_chofer_id and estado <> 'anulado';

  if v_anticipo is null then
    v_serie := fn_serie_disponible('anticipo');
    insert into anticipos(organizacion_id, chofer_id, eleccion_id, monto)
    values (v_org, p_chofer_id, v_elec, p_monto)
    returning id into v_anticipo;
    if v_serie is not null then
      v_folio := fn_asignar_folio(v_serie, 'anticipo', v_anticipo);
      update anticipos set folio_id = v_folio where id = v_anticipo;
    end if;
  end if;

  update anticipos
     set pagado = true, fecha_pago = now(), pagado_por = auth.uid(),
         estado = 'pagado', monto = coalesce(p_monto, monto)
   where id = v_anticipo and not pagado;

  return jsonb_build_object('anticipo_id', v_anticipo, 'folio_id', v_folio);
end $$;

-- ---------------------------------------------------------------------
-- Pago final, en DOS pasos.
--   C4: quien autoriza no es quien paga.
--   C3: sin actividad registrada hace falta excepción aprobada.
-- ---------------------------------------------------------------------
create or replace function fn_autorizar_pago_final(
  p_chofer_id uuid, p_excepcion_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := auth_organizacion_id();
  v_elec uuid; v_pago uuid; v_actividad boolean;
begin
  if not auth_tiene_permiso('caja.autorizar_pago') then
    raise exception 'SIN_PERMISO: autorizar el pago final requiere rol administrador'
      using errcode = 'insufficient_privilege';
  end if;

  select eleccion_id into v_elec from choferes
   where id = p_chofer_id and organizacion_id = v_org and deleted_at is null;
  if v_elec is null then
    raise exception 'CHOFER_INEXISTENTE' using errcode = 'no_data_found';
  end if;

  select exists (select 1 from actividad_diaria
                  where chofer_id = p_chofer_id and clasificacion = 'activo')
    into v_actividad;

  if not v_actividad and p_excepcion_id is null then
    raise exception 'SIN_ACTIVIDAD: el chofer no tiene actividad registrada. '
                    'Requiere una excepción aprobada para autorizar el pago.'
      using errcode = 'check_violation';
  end if;

  if p_excepcion_id is not null
     and not exists (select 1 from excepciones
                      where id = p_excepcion_id and estado = 'aprobada'
                        and (vence_en is null or vence_en > now())) then
    raise exception 'EXCEPCION_INVALIDA: la excepción no está aprobada o venció'
      using errcode = 'check_violation';
  end if;

  select id into v_pago from pagos_finales
   where chofer_id = p_chofer_id and estado <> 'anulado';

  if v_pago is null then
    insert into pagos_finales(organizacion_id, chofer_id, eleccion_id,
                              basado_en_actividad, excepcion_id, estado)
    values (v_org, p_chofer_id, v_elec, v_actividad, p_excepcion_id, 'pendiente')
    returning id into v_pago;
  end if;

  update pagos_finales
     set autorizado_por = auth.uid(), basado_en_actividad = v_actividad,
         excepcion_id = coalesce(p_excepcion_id, excepcion_id)
   where id = v_pago;

  return v_pago;
end $$;

create or replace function fn_registrar_pago_final(p_chofer_id uuid, p_monto numeric default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pago uuid; v_autorizo uuid; v_serie uuid; v_folio uuid;
begin
  if not auth_tiene_permiso('caja.marcar_pago_final') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  select id, autorizado_por into v_pago, v_autorizo from pagos_finales
   where chofer_id = p_chofer_id and estado <> 'anulado';

  if v_pago is null or v_autorizo is null then
    raise exception 'SIN_AUTORIZACION: el pago final tiene que estar autorizado antes de marcarse'
      using errcode = 'check_violation';
  end if;

  -- C4: separación de funciones. La misma persona no autoriza y paga.
  if v_autorizo = auth.uid() then
    raise exception 'MISMA_PERSONA: quien autorizó el pago no puede marcarlo como pagado'
      using errcode = 'check_violation';
  end if;

  v_serie := fn_serie_disponible('pago_final');
  if v_serie is not null then
    v_folio := fn_asignar_folio(v_serie, 'pago_final', v_pago);
  end if;

  update pagos_finales
     set finalizado = true, fecha_finalizacion = now(), registrado_por = auth.uid(),
         estado = 'finalizado', monto = coalesce(p_monto, monto),
         folio_id = coalesce(v_folio, folio_id)
   where id = v_pago and not finalizado;

  return jsonb_build_object('pago_id', v_pago, 'folio_id', v_folio);
end $$;

-- ---------------------------------------------------------------------
-- Lista negra. D-06: motivo del catálogo, vigencia indefinida por defecto.
-- ---------------------------------------------------------------------
create or replace function fn_agregar_lista_negra(
  p_ci            text,
  p_motivo        motivo_lista_negra,
  p_detalle       text default null,
  p_severidad     lista_negra_severidad default 'bloqueo_total',
  p_vence_en      timestamptz default null,
  p_evidencia_url text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := auth_organizacion_id();
  v_ci text := fn_normalizar_ci(p_ci);
  v_persona uuid; v_id uuid;
begin
  if not auth_tiene_permiso('lista_negra.gestionar') then
    raise exception 'SIN_PERMISO: gestionar la lista negra requiere rol administrador'
      using errcode = 'insufficient_privilege';
  end if;
  if v_ci is null then
    raise exception 'CI_OBLIGATORIO' using errcode = 'check_violation';
  end if;

  select id into v_persona from personas
   where organizacion_id = v_org and ci = v_ci and deleted_at is null;
  if v_persona is null then
    raise exception 'PERSONA_INEXISTENTE: la cédula % no está en el sistema', v_ci
      using errcode = 'no_data_found';
  end if;

  if exists (select 1 from lista_negra
              where persona_id = v_persona and revocado_en is null
                and vigente_desde <= now()
                and (vigente_hasta is null or vigente_hasta > now())) then
    raise exception 'YA_EN_LISTA_NEGRA: esa persona ya tiene una entrada vigente'
      using errcode = 'unique_violation';
  end if;

  insert into lista_negra(organizacion_id, persona_id, motivo_codigo, motivo_detalle,
                          severidad, vigente_hasta, evidencia_url,
                          registrado_por, aprobado_por)
  values (v_org, v_persona, p_motivo, p_detalle, p_severidad, p_vence_en,
          p_evidencia_url, auth.uid(), auth.uid())
  returning id into v_id;

  return v_id;
end $$;

create or replace function fn_revocar_lista_negra(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not auth_tiene_permiso('lista_negra.revocar') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'MOTIVO_OBLIGATORIO: una revocación sin motivo no es auditable'
      using errcode = 'check_violation';
  end if;

  -- La entrada original nunca se borra: se marca revocada.
  update lista_negra
     set revocado_en = now(), revocado_por = auth.uid(), motivo_revocacion = p_motivo
   where id = p_id and revocado_en is null and organizacion_id = auth_organizacion_id();

  if not found then
    raise exception 'NO_REVOCABLE: no existe o ya estaba revocada'
      using errcode = 'check_violation';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Vistas de apoyo
-- ---------------------------------------------------------------------
create or replace view v_lista_negra
with (security_invoker = true) as
select l.id, l.organizacion_id, l.persona_id,
       p.ci, p.nombre_completo,
       l.motivo_codigo, l.motivo_detalle, l.severidad,
       l.vigente_desde, l.vigente_hasta, l.revocado_en, l.motivo_revocacion,
       (l.revocado_en is null
        and l.vigente_desde <= now()
        and (l.vigente_hasta is null or l.vigente_hasta > now())) as vigente,
       l.created_at
  from lista_negra l
  join personas p on p.id = l.persona_id;

create or replace view v_folios_series
with (security_invoker = true) as
select s.id, s.organizacion_id, s.eleccion_id, s.tipo_documento, s.prefijo,
       s.desde, s.hasta, s.estado,
       count(f.id)                                            as total,
       count(f.id) filter (where f.estado = 'disponible')     as disponibles,
       count(f.id) filter (where f.estado = 'usado')          as usados,
       count(f.id) filter (where f.estado = 'anulado')        as anulados
  from folios_series s
  left join folios f on f.serie_id = s.id
 group by s.id;

create or replace view v_caja
with (security_invoker = true) as
select ch.id                          as chofer_id,
       ch.organizacion_id, ch.eleccion_id,
       p.ci, p.nombre_completo,
       cand.nombre_publico            as candidato,
       coalesce(co.firmado, false)    as contrato_firmado,
       co.fecha_firma,
       coalesce(vc.entregado, false)  as vale_entregado,
       coalesce(an.pagado, false)     as anticipo_pagado,
       coalesce(pf.finalizado, false) as pago_finalizado,
       pf.autorizado_por,
       ad.clasificacion               as actividad
  from choferes ch
  join personas p on p.id = ch.persona_id
  left join asignaciones a on a.chofer_id = ch.id and a.vigente_hasta is null
  left join candidatos cand on cand.id = a.candidato_id
  left join contratos co on co.chofer_id = ch.id and co.estado <> 'anulado'
  left join vales_combustible vc on vc.chofer_id = ch.id and vc.estado <> 'anulado'
  left join anticipos an on an.chofer_id = ch.id and an.estado <> 'anulado'
  left join pagos_finales pf on pf.chofer_id = ch.id and pf.estado <> 'anulado'
  left join actividad_diaria ad on ad.chofer_id = ch.id
 where ch.deleted_at is null and ch.estado = 'activo';
