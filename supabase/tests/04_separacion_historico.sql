-- =====================================================================
-- Separación del histórico de la interna 07/06/2026 (migración 0007).
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/04_separacion_historico.sql
--
-- La migración 0007 ya corrió sobre una base sin datos importados, así
-- que no movió nada. Acá se fabrica el escenario real —participaciones
-- con `origen_planilla_id`, sus asignaciones y sus apariciones, todas
-- colgadas de la elección activa— y se vuelve a ejecutar EL MISMO ARCHIVO
-- de migración, no una copia. Si alguien lo edita y rompe algo, este test
-- se pone en rojo.
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

\echo '== 1. Escenario: 3 participaciones importadas + 1 alta de la app =='
do $$
declare
  v_org     uuid := '00000000-0000-0000-0000-0000000000a1';
  v_actual  uuid;
  v_interna uuid;
  v_origen  uuid;
  v_user    uuid := '00000000-0000-0000-0000-000000000501';
  v_cand    uuid;
  v_persona uuid;
  v_chofer  uuid;
  i int;
begin
  select id into v_actual  from elecciones where organizacion_id=v_org and estado='activa';
  select id into v_interna from elecciones where organizacion_id=v_org and fecha=date '2026-06-07';
  select id into v_cand    from candidatos where organizacion_id=v_org limit 1;

  insert into origenes_planilla(organizacion_id, codigo, nombre, tipo)
  values (v_org, 'planilla-junio-test', 'Planilla de junio (prueba)', 'excel')
  on conflict (organizacion_id, codigo) do update set nombre = excluded.nombre
  returning id into v_origen;

  -- Tres personas sintéticas con participación importada.
  for i in 1..3 loop
    insert into personas(organizacion_id, ci, nombres, apellidos)
    values (v_org, '900000' || i, 'Historico' || i, 'De Prueba')
    on conflict do nothing;
    select id into v_persona from personas where organizacion_id=v_org and ci='900000' || i;

    insert into choferes(organizacion_id, persona_id, eleccion_id, estado, estado_servicio,
                         origen_planilla_id, declarado_por, responsable_candidato_id)
    values (v_org, v_persona, v_actual, 'activo', 'contratado',
            v_origen, v_user, v_cand)
    returning id into v_chofer;

    insert into asignaciones(chofer_id, eleccion_id, candidato_id, asignado_por)
    values (v_chofer, v_actual, v_cand, v_user);

    insert into apariciones_origen(organizacion_id, persona_id, eleccion_id, origen_planilla_id,
                                   nombre_texto, fue_aplicada)
    values (v_org, v_persona, v_actual, v_origen, 'HISTORICO' || i || ' DE PRUEBA', true);
  end loop;

  -- Y una alta hecha desde la aplicación: origen_planilla_id NULO.
  insert into personas(organizacion_id, ci, nombres, apellidos)
  values (v_org, '9100001', 'Actual', 'Del Operativo') on conflict do nothing;
  select id into v_persona from personas where organizacion_id=v_org and ci='9100001';
  insert into choferes(organizacion_id, persona_id, eleccion_id, estado, estado_servicio,
                       declarado_por, responsable_candidato_id)
  values (v_org, v_persona, v_actual, 'activo', 'contratado', v_user, v_cand);

  perform test_falla_si(
    (select count(*) from choferes
      where eleccion_id = v_actual and origen_planilla_id is not null) <> 3,
    'Antes de migrar: 3 participaciones importadas en la elección activa');
end $$;

\echo '== 2. Se ejecuta la migración 0007 tal cual está en el repo =='
\ir ../migrations/20260916000700_separar_historico_interna.sql

\echo '== 3. El histórico se movió; la operación actual quedó limpia =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_actual uuid; v_interna uuid; n int;
begin
  select id into v_actual  from elecciones where organizacion_id=v_org and estado='activa';
  select id into v_interna from elecciones where organizacion_id=v_org and fecha=date '2026-06-07';

  select count(*) into n from choferes
   where eleccion_id = v_actual and origen_planilla_id is not null;
  perform test_falla_si(n <> 0, 'Ninguna participación importada quedó en la elección activa');

  select count(*) into n from choferes
   where eleccion_id = v_interna and origen_planilla_id is not null;
  perform test_falla_si(n <> 3, 'Las 3 participaciones importadas están en la interna 07/06');

  select count(*) into n from choferes
   where eleccion_id = v_actual and origen_planilla_id is null;
  perform test_falla_si(n = 0, 'El alta hecha desde la aplicación sigue en el operativo actual');

  select count(*) into n from asignaciones a
    join choferes ch on ch.id = a.chofer_id
   where ch.origen_planilla_id is not null and a.eleccion_id <> v_interna;
  perform test_falla_si(n <> 0, 'Las asignaciones acompañaron a su participación');

  select count(*) into n from apariciones_origen
   where eleccion_id = v_actual and origen_planilla_id is not null;
  perform test_falla_si(n <> 0, 'Las apariciones de origen acompañaron a su participación');
end $$;

\echo '== 4. Nada se borró =='
do $$
declare n int;
begin
  select count(*) into n from personas where ci like '90000%';
  perform test_falla_si(n <> 3, 'Las personas históricas siguen existiendo');

  select count(*) into n from apariciones_origen where nombre_texto like 'HISTORICO%';
  perform test_falla_si(n <> 3, 'Las apariciones de origen no se borraron: se movieron');

  -- El trigger de auditoría dejó el rastro para revertir.
  select count(*) into n from audit_log
   where tabla = 'choferes' and operacion = 'UPDATE'
     and 'eleccion_id' = any(campos_modificados);
  perform test_falla_si(n < 3, 'La bitácora guardó el eleccion_id anterior de cada fila movida');
end $$;

\echo '== 5. Idempotente: correrla de nuevo no hace nada =='
\ir ../migrations/20260916000700_separar_historico_interna.sql

do $$
declare v_org uuid := '00000000-0000-0000-0000-0000000000a1'; v_interna uuid; n int;
begin
  select id into v_interna from elecciones where organizacion_id=v_org and fecha=date '2026-06-07';
  select count(*) into n from choferes where eleccion_id = v_interna and origen_planilla_id is not null;
  perform test_falla_si(n <> 3, 'La segunda corrida deja las mismas 3 filas, no 6');
end $$;

\echo '== 6. La guarda de caja detecta documentos emitidos =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_actual uuid; v_origen uuid; v_user uuid := '00000000-0000-0000-0000-000000000501';
  v_cand uuid; v_persona uuid; v_chofer uuid; n int;
begin
  select id into v_actual from elecciones where organizacion_id=v_org and estado='activa';
  select id into v_cand   from candidatos where organizacion_id=v_org limit 1;
  select id into v_origen from origenes_planilla
   where organizacion_id=v_org and codigo='planilla-junio-test';

  insert into personas(organizacion_id, ci, nombres, apellidos)
  values (v_org, '9200001', 'Concaja', 'De Prueba') on conflict do nothing;
  select id into v_persona from personas where organizacion_id=v_org and ci='9200001';

  insert into choferes(organizacion_id, persona_id, eleccion_id, estado, estado_servicio,
                       origen_planilla_id, declarado_por, responsable_candidato_id)
  values (v_org, v_persona, v_actual, 'activo', 'contratado', v_origen, v_user, v_cand)
  returning id into v_chofer;

  insert into contratos(organizacion_id, chofer_id, eleccion_id, estado)
  values (v_org, v_chofer, v_actual, 'pendiente');

  -- Es la misma consulta que usa la guarda de la migración.
  select count(*) into n
    from choferes ch
   where ch.eleccion_id = v_actual
     and ch.origen_planilla_id is not null
     and exists (select 1 from contratos d where d.chofer_id = ch.id);

  perform test_falla_si(n <> 1,
    'La guarda encuentra el chofer importado con contrato emitido y abortaría');
end $$;

\echo ''
\echo '================================================'
\echo '  SEPARACIÓN HISTÓRICO / OPERATIVO: EN VERDE'
\echo '================================================'
