-- =====================================================================
-- Invariantes de exportación, reportes y GPS (día 5).
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/03_exportacion.sql
--
-- Corre después de 01 y 02: reutiliza sus personas y choferes sintéticos.
--
-- Lo que se prueba acá no es "el archivo se genera" —eso lo verifica el
-- build— sino las tres reglas de las que depende la exportación y que
-- viven en la base, no en TypeScript:
--
--   1. El permiso `datos.exportar` se aplica al ESCRIBIR el registro de
--      exportación. Si RLS rechaza el insert, no hay archivo. Por eso el
--      código no pregunta antes: escribe, y si no puede, no exporta.
--   2. `exportaciones` es append-only y está aislada por organización.
--   3. El vínculo GPS es una clave foránea por cédula (D-04), no un
--      nombre, y la base impide el doble vínculo en ambas direcciones.
--
-- Además se verifica que las vistas expongan EXACTAMENTE las columnas que
-- el exportador pide. Un `select` de una columna inexistente en PostgREST
-- falla en producción, no en `next build`: acá se agarra antes.
-- =====================================================================

\set ON_ERROR_STOP on

create or replace function test_ok(p text) returns void
language plpgsql as $$ begin raise notice '  OK  %', p; end $$;

create or replace function test_falla_si(p_cond boolean, p text) returns void
language plpgsql as $$
begin
  if p_cond then raise exception 'FALLÓ: %', p; end if;
  raise notice '  OK  %', p;
end $$;

/* Contrato entre el código y la base: si una vista pierde una columna, el
   exportador se rompe en producción. Acá se rompe el test. */
create or replace function test_columnas(p_vista text, p_cols text[]) returns void
language plpgsql as $$
declare faltan text[];
begin
  select array_agg(c) into faltan from unnest(p_cols) c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_vista and column_name = c);
  if faltan is not null then
    raise exception 'FALLÓ: la vista % no expone: %', p_vista, array_to_string(faltan, ', ');
  end if;
  raise notice '  OK  % expone las % columnas que usa el exportador',
               p_vista, array_length(p_cols, 1);
end $$;

-- ---------------------------------------------------------------------
-- Usuarios: uno de cada permiso relevante, todos en la organización 1.
-- ---------------------------------------------------------------------
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_adm uuid := '00000000-0000-0000-0000-000000000701';   -- exporta + PII + auditoría
  v_coo uuid := '00000000-0000-0000-0000-000000000702';   -- exporta, sin PII
  v_con uuid := '00000000-0000-0000-0000-000000000703';   -- no exporta
begin
  insert into auth.users(id, email) values
    (v_adm,'exp-admin@t.local'), (v_coo,'exp-coord@t.local'), (v_con,'exp-consulta@t.local')
    on conflict do nothing;
  insert into usuarios(id, organizacion_id, email, nombre_completo) values
    (v_adm, v_org, 'exp-admin@t.local','Admin de exportación'),
    (v_coo, v_org, 'exp-coord@t.local','Coordinador'),
    (v_con, v_org, 'exp-consulta@t.local','Sólo consulta')
    on conflict do nothing;

  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_adm, id, v_org from roles where codigo='admin' on conflict do nothing;
  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_coo, id, v_org from roles where codigo='coordinador' on conflict do nothing;
  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_con, id, v_org from roles where codigo='consulta' on conflict do nothing;

  insert into usuario_scopes(usuario_id, organizacion_id, tipo) values
    (v_adm, v_org, 'global'), (v_coo, v_org, 'global'), (v_con, v_org, 'global')
    on conflict do nothing;
end $$;

\echo '== 1. Las vistas exponen lo que el exportador pide =='
do $$
begin
  -- src/lib/exportacion.ts → consultarPlanilla()
  perform test_columnas('v_choferes_ficha', array[
    'chofer_id','ci','nombre_completo','telefono_e164','chapa','categoria','candidato',
    'barrio','supervisor','responsable','responsable_tipo','estado','estado_identidad',
    'estado_servicio','contrato_firmado','vale_entregado','anticipo_pagado',
    'pago_finalizado','actividad']);

  -- src/app/api/exportar/xlsx/route.ts → construirCaja()
  perform test_columnas('v_caja', array[
    'ci','nombre_completo','candidato','contrato_firmado','fecha_firma','vale_entregado',
    'anticipo_pagado','pago_finalizado','actividad']);

  -- construirFolios() y el control de folios de /reportes
  perform test_columnas('v_folios_series', array[
    'id','tipo_documento','prefijo','desde','hasta','estado','total','disponibles',
    'usados','anulados']);

  -- /reportes: conteo de lista negra vigente
  perform test_columnas('v_lista_negra', array['id','ci','nombre_completo','vigente']);
end $$;

\echo '== 2. El permiso se aplica al registrar, no al preguntar =='
do $$
declare ok boolean := false; n int;
begin
  -- Coordinador: tiene datos.exportar.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
  set local role authenticated;
  insert into exportaciones(organizacion_id, usuario_id, tipo, formato, filtros, filas, incluye_pii)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000702',
          'planilla','xlsx','{"barrio":"Centro"}'::jsonb, 42, false);
  perform test_ok('Un usuario con datos.exportar registra su exportación');
  reset role;

  -- Consulta: no lo tiene. El insert es el que rebota.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
  set local role authenticated;
  begin
    insert into exportaciones(organizacion_id, usuario_id, tipo, formato, filas)
    values ('00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-000000000703','planilla','xlsx', 42);
  exception when others then ok := true;
  end;
  perform test_falla_si(not ok, 'Sin datos.exportar el registro se rechaza: no hay archivo');
  reset role;

  -- Nadie registra una exportación a nombre de otro.
  ok := false;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
  set local role authenticated;
  begin
    insert into exportaciones(organizacion_id, usuario_id, tipo, formato, filas)
    values ('00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-000000000701','planilla','xlsx', 42);
  exception when others then ok := true;
  end;
  perform test_falla_si(not ok, 'No se puede registrar una exportación a nombre de otro usuario');
  reset role;

  select count(*) into n from exportaciones;
  perform test_falla_si(n <> 1, 'Quedó exactamente 1 exportación registrada (las rechazadas no dejan rastro)');
end $$;

\echo '== 3. La bitácora de exportaciones es inmutable =='
do $$
declare ok boolean := false; v_id uuid;
begin
  select id into v_id from exportaciones limit 1;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
  set local role authenticated;

  begin delete from exportaciones where id = v_id;
  exception when others then ok := true; end;
  perform test_falla_si(not ok, 'Nadie borra un registro de exportación');

  -- No hay política de UPDATE: sin política, la operación no existe.
  ok := false;
  begin
    update exportaciones set filas = 0 where id = v_id;
    ok := not found;
  exception when others then ok := true; end;
  perform test_falla_si(not ok, 'Nadie reescribe cuántas filas se llevó');
  reset role;
end $$;

\echo '== 4. Quién ve qué exportaciones =='
do $$
declare n int;
begin
  -- El admin exporta lo suyo.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
  set local role authenticated;
  insert into exportaciones(organizacion_id, usuario_id, tipo, formato, filas, incluye_pii)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000701','caja','xlsx', 7, true);
  -- Tiene auditoria.ver: ve las dos.
  select count(*) into n from exportaciones;
  perform test_falla_si(n <> 2, 'Con auditoria.ver se ven todas las exportaciones de la organización');
  reset role;

  -- El coordinador ve sólo la suya.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
  set local role authenticated;
  select count(*) into n from exportaciones;
  perform test_falla_si(n <> 1, 'Sin auditoria.ver cada uno ve sólo sus propias exportaciones');
  reset role;

  -- Otra organización no ve nada. (Usuario 502, creado en 01_invariantes.)
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
  set local role authenticated;
  select count(*) into n from exportaciones;
  perform test_falla_si(n <> 0, 'D-12: otra organización ve 0 exportaciones');
  reset role;
end $$;

\echo '== 5. Exportar con PII deja un acceso sensible =='
do $$
declare ok boolean := false; n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
  set local role authenticated;
  insert into accesos_sensibles(organizacion_id, usuario_id, recurso, accion, contexto)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000701','pii','exportacion',
          '{"tipo":"planilla","filas":7}'::jsonb);
  select count(*) into n from accesos_sensibles
   where recurso='pii' and accion='exportacion';
  perform test_falla_si(n <> 1, 'La exportación de cédulas completas queda en accesos_sensibles');

  begin update accesos_sensibles set recurso='caja' where accion='exportacion';
        ok := not found;
  exception when others then ok := true; end;
  perform test_falla_si(not ok, 'El registro de acceso sensible no se puede reescribir');
  reset role;
end $$;

\echo '== 6. El límite de ritmo se puede contar desde la propia tabla =='
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
  set local role authenticated;
  -- Es la consulta exacta de verificarCuota(): sin tabla extra ni estado
  -- en memoria, que no sobreviviría a una función serverless.
  select count(*) into n from exportaciones
   where usuario_id = '00000000-0000-0000-0000-000000000702'
     and created_at >= now() - interval '10 minutes';
  perform test_falla_si(n <> 1, 'La cuota se cuenta sobre la propia bitácora ('||n||'/20)');
  reset role;
end $$;

\echo '== 7. D-04: el vínculo GPS es por cédula, no por nombre =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ch1 uuid; v_ch2 uuid; v_ele uuid; v_disp uuid; ok boolean := false;
begin
  select id, eleccion_id into v_ch1, v_ele from choferes
   where organizacion_id = v_org and estado='activo' and deleted_at is null
   order by created_at limit 1;
  select id into v_ch2 from choferes
   where organizacion_id = v_org and estado='activo' and deleted_at is null and id <> v_ch1
   order by created_at limit 1;
  perform test_falla_si(v_ch1 is null or v_ch2 is null,
                        'Hay al menos dos choferes activos para probar el vínculo');

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
  set local role authenticated;

  insert into dispositivos_gps(organizacion_id, eleccion_id, chofer_id,
                               traccar_device_id, unique_id, estado, alta_en)
  values (v_org, v_ele, v_ch1, 9001, 'IMEI-9001', 'activo', now())
  returning id into v_disp;
  perform test_ok('Un equipo se vincula al chofer resuelto por cédula');

  -- Un chofer, un equipo.
  begin
    insert into dispositivos_gps(organizacion_id, eleccion_id, chofer_id,
                                 traccar_device_id, unique_id, estado)
    values (v_org, v_ele, v_ch1, 9002, 'IMEI-9002', 'activo');
  exception when unique_violation then ok := true; end;
  perform test_falla_si(not ok, 'Un chofer no puede tener dos equipos activos');

  -- Un equipo, un chofer: esto es lo que el cruce por nombre no garantizaba.
  ok := false;
  begin
    insert into dispositivos_gps(organizacion_id, eleccion_id, chofer_id,
                                 traccar_device_id, unique_id, estado)
    values (v_org, v_ele, v_ch2, 9001, 'IMEI-9003', 'activo');
  exception when unique_violation then ok := true; end;
  perform test_falla_si(not ok, 'Un mismo device de Traccar no se vincula a dos choferes');

  -- La baja libera al chofer para un reemplazo.
  update dispositivos_gps set estado='baja', baja_en=now() where id = v_disp;
  insert into dispositivos_gps(organizacion_id, eleccion_id, chofer_id,
                               traccar_device_id, unique_id, estado, alta_en)
  values (v_org, v_ele, v_ch1, 9004, 'IMEI-9004', 'activo', now());
  perform test_ok('Dado de baja el equipo, el chofer admite un reemplazo');
  reset role;
end $$;

\echo '== 8. Sin gps.gestionar_dispositivos no se vincula nada =='
do $$
declare ok boolean := false; n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
  set local role authenticated;
  begin
    insert into dispositivos_gps(organizacion_id, eleccion_id, chofer_id, traccar_device_id, estado)
    select '00000000-0000-0000-0000-0000000000a1', eleccion_id, id, 9999, 'activo'
      from choferes where estado='activo' limit 1;
  exception when others then ok := true; end;
  perform test_falla_si(not ok, 'El rol consulta no vincula dispositivos');

  -- Sí tiene gps.ver, así que los ve.
  select count(*) into n from dispositivos_gps;
  perform test_falla_si(n = 0, 'El rol consulta sí ve los dispositivos ('||n||')');
  reset role;
end $$;

\echo '== 9. Nadie inventa un evento de GPS desde la pantalla =='
do $$
declare ok boolean := false; v_disp uuid; v_ele uuid;
begin
  select id, eleccion_id into v_disp, v_ele from dispositivos_gps where estado='activo' limit 1;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
  set local role authenticated;
  begin
    insert into traccar_eventos(dispositivo_id, eleccion_id, tipo, ocurrido_en)
    values (v_disp, v_ele, 'deviceMoving', now());
  exception when others then ok := true; end;
  perform test_falla_si(not ok,
    'Ni un admin puede insertar un evento de Traccar: sólo el job server-side');
  reset role;
end $$;

\echo ''
\echo '================================================'
\echo '  INVARIANTES DE EXPORTACIÓN Y GPS: TODOS EN VERDE'
\echo '================================================'
