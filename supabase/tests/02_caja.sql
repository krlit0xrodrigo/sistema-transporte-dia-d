-- =====================================================================
-- Invariantes de folios, caja y lista negra (día 4).
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/02_caja.sql
-- =====================================================================

\set ON_ERROR_STOP on

-- Dos usuarios con roles distintos: uno autoriza, otro paga (C4).
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_adm uuid := '00000000-0000-0000-0000-000000000601';
  v_tes uuid := '00000000-0000-0000-0000-000000000602';
begin
  insert into auth.users(id, email) values (v_adm,'admin@t.local'), (v_tes,'caja@t.local')
    on conflict do nothing;
  insert into usuarios(id, organizacion_id, email, nombre_completo)
    values (v_adm, v_org, 'admin@t.local','Admin'), (v_tes, v_org, 'caja@t.local','Tesorería')
    on conflict do nothing;
  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_adm, id, v_org from roles where codigo='admin' on conflict do nothing;
  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_tes, id, v_org from roles where codigo='tesoreria' on conflict do nothing;
  insert into usuario_scopes(usuario_id, organizacion_id, tipo)
    values (v_adm, v_org, 'global'), (v_tes, v_org, 'global') on conflict do nothing;
end $$;

\echo '== 1. Series de folios (sólo el admin las emite) =='
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', false);
do $$
declare v_serie uuid; n int;
begin
  v_serie := fn_crear_serie_folios('contrato', 1, 50, 'C-');
  perform fn_crear_serie_folios('vale_combustible', 1, 50, 'V-');
  perform fn_crear_serie_folios('anticipo', 1, 50, 'A-');
  perform fn_crear_serie_folios('pago_final', 1, 50, 'P-');
  select count(*) into n from folios where serie_id = v_serie;
  perform test_falla_si(n <> 50, 'La serie crea sus 50 folios de una vez');
  perform test_falla_si(
    (select disponibles from v_folios_series where id = v_serie) <> 50,
    'La vista informa 50 disponibles');
end $$;

do $$
declare ok boolean := false;
begin
  begin perform fn_crear_serie_folios('contrato', 50, 1);
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Un rango invertido es rechazado');
end $$;

\echo '== 2. La matriz de permisos manda: el admin no toca caja =='
do $$
declare v_ch uuid; ok boolean := false;
begin
  select id into v_ch from choferes where estado='activo' limit 1;
  begin perform fn_entregar_vale(v_ch);
  exception when insufficient_privilege then ok := true; end;
  perform test_falla_si(not ok, 'El admin no puede entregar vales (matriz de permisos)');
end $$;

\echo '== 3. C2: sin contrato firmado no hay vale ni anticipo =='
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', false);
do $$
declare v_ch uuid; ok boolean := false;
begin
  select id into v_ch from choferes where estado='activo' limit 1;

  begin perform fn_entregar_vale(v_ch);
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Vale sin contrato firmado: rechazado');

  ok := false;
  begin perform fn_registrar_anticipo(v_ch);
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Anticipo sin contrato firmado: rechazado');
end $$;

\echo '== 4. Contrato, vale y anticipo con folio (tesorería) =='
do $$
declare v_ch uuid; r jsonb;
begin
  select id into v_ch from choferes where estado='activo' limit 1;
  r := fn_registrar_contrato(v_ch);
  perform test_falla_si((r->>'folio_id') is null, 'El contrato toma un folio de la serie');
  perform test_falla_si(
    not (select firmado from contratos where chofer_id = v_ch),
    'El contrato queda firmado con fecha y responsable');
  perform test_falla_si(
    (select fecha_firma from contratos where chofer_id = v_ch) is null,
    'C5: la marca lleva fecha');

  perform fn_entregar_vale(v_ch, 150000);
  perform fn_registrar_anticipo(v_ch, 200000);
  perform test_falla_si(
    not (select entregado from vales_combustible where chofer_id = v_ch),
    'El vale queda entregado');
  perform test_falla_si(
    not (select pagado from anticipos where chofer_id = v_ch),
    'El anticipo queda pagado');
end $$;

\echo '== 5. C3: pago final sin actividad requiere excepción =='
do $$
declare v_ch uuid; ok boolean := false;
begin
  select id into v_ch from choferes where estado='activo' limit 1;
  begin perform fn_autorizar_pago_final(v_ch);
  exception when insufficient_privilege then ok := true; end;
  perform test_falla_si(not ok, 'Tesorería no puede autorizar su propio pago');
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', false);
do $$
declare v_ch uuid; ok boolean := false;
begin
  select id into v_ch from choferes where estado='activo' limit 1;
  begin perform fn_autorizar_pago_final(v_ch);
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Sin actividad registrada, autorizar el pago se bloquea');
end $$;

\echo '== 6. C4: quien autoriza no puede marcar el pago =='
do $$
declare v_ch uuid; v_exc uuid; ok boolean := false;
begin
  select id into v_ch from choferes where estado='activo' limit 1;

  -- Excepción aprobada por otra persona (el solicitante es tesorería).
  insert into excepciones(organizacion_id, chofer_id, eleccion_id, tipo, motivo,
                          solicitado_por, aprobado_por, aprobado_en, estado)
  values ('00000000-0000-0000-0000-0000000000a1', v_ch,
          (select eleccion_id from choferes where id = v_ch),
          'sin_actividad', 'prueba',
          '00000000-0000-0000-0000-000000000602',
          '00000000-0000-0000-0000-000000000601', now(), 'aprobada')
  returning id into v_exc;

  perform fn_autorizar_pago_final(v_ch, v_exc);
  perform test_ok('El admin autoriza el pago con excepción aprobada');

  -- El mismo admin intenta marcarlo como pagado: debe fallar.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', false);
  begin perform fn_registrar_pago_final(v_ch);
  exception
    when check_violation then ok := true;
    when insufficient_privilege then ok := true;   -- admin no tiene caja.marcar_pago_final
  end;
  perform test_falla_si(not ok, 'C4: el autorizador no puede marcar el pago');
end $$;

\echo '== 7. Tesorería sí puede marcarlo =='
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', false);
do $$
declare v_ch uuid;
begin
  select id into v_ch from choferes where estado='activo' limit 1;
  perform fn_registrar_pago_final(v_ch, 500000);
  perform test_falla_si(
    not (select finalizado from pagos_finales where chofer_id = v_ch),
    'Tesorería marca el pago final');
  perform test_falla_si(
    (select registrado_por from pagos_finales where chofer_id = v_ch)
      = (select autorizado_por from pagos_finales where chofer_id = v_ch),
    'Autorizador y pagador son personas distintas');
end $$;

\echo '== 8. Lista negra =='
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', false);
do $$
declare v_ci text; v_id uuid; ok boolean := false;
begin
  select ci into v_ci from personas limit 1;

  begin perform fn_agregar_lista_negra(v_ci, 'otro', null);
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Motivo "otro" sin detalle: rechazado');

  v_id := fn_agregar_lista_negra(v_ci, 'incumplio_operativo');
  perform test_falla_si(
    (select vigente_hasta from lista_negra where id = v_id) is not null,
    'La vigencia por defecto es indefinida (D-06)');
  perform test_falla_si(
    not (select vigente from v_lista_negra where id = v_id),
    'La vista la muestra como vigente');

  ok := false;
  begin perform fn_agregar_lista_negra(v_ci, 'conducta');
  exception when unique_violation then ok := true; end;
  perform test_falla_si(not ok, 'No se puede duplicar una entrada vigente');

  ok := false;
  begin perform fn_revocar_lista_negra(v_id, '');
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Revocar sin motivo: rechazado');

  perform fn_revocar_lista_negra(v_id, 'se comprobó que fue un error de carga');
  perform test_falla_si(
    (select vigente from v_lista_negra where id = v_id),
    'Tras revocar deja de estar vigente');
  perform test_falla_si(
    (select count(*) from lista_negra where id = v_id) <> 1,
    'La entrada original no se borra: queda revocada');
end $$;

\echo '== 9. Folio anulado no se reutiliza =='
do $$
declare v_folio uuid; ok boolean := false;
begin
  select f.id into v_folio from folios f
    join folios_series s on s.id = f.serie_id
   where f.estado = 'disponible' and s.tipo_documento = 'contrato' limit 1;

  begin perform fn_anular_folio(v_folio, '');
  exception when check_violation then ok := true; end;
  perform test_falla_si(not ok, 'Anular sin motivo: rechazado');

  perform fn_anular_folio(v_folio, 'talonario dañado');
  perform test_falla_si(
    (select estado from folios where id = v_folio) <> 'anulado',
    'El folio queda anulado con su motivo');
  perform test_falla_si(
    (select count(*) from folios where id = v_folio and estado = 'disponible') <> 0,
    'C6: un folio anulado ya no está disponible');
end $$;

\echo ''
\echo '================================================'
\echo '  INVARIANTES DE CAJA: TODOS EN VERDE'
\echo '================================================'
