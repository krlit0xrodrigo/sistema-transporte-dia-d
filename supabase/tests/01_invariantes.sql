-- =====================================================================
-- Test de invariantes críticos.
-- Se corre contra una base limpia con migraciones + seed aplicados.
-- Cada bloque falla con `raise exception` si el invariante no se cumple.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/01_invariantes.sql
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

-- ---------------------------------------------------------------------
-- Datos de prueba (sintéticos — ningún dato real)
-- ---------------------------------------------------------------------
do $$
declare
  v_org2 uuid := '00000000-0000-0000-0000-0000000000a2';
  v_org1 uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ele  uuid := '00000000-0000-0000-0000-0000000000e2';
  v_u1   uuid := '00000000-0000-0000-0000-000000000501';
  v_u2   uuid := '00000000-0000-0000-0000-000000000502';
  v_cand uuid;
  v_resp uuid;
begin
  insert into organizaciones(id, codigo, nombre) values (v_org2,'otra-org','Otro operativo')
    on conflict do nothing;
  insert into elecciones(id, organizacion_id, nombre, tipo, fecha, estado)
    values ('00000000-0000-0000-0000-0000000000e9', v_org2, 'Otra elección','municipal','2026-10-04','activa')
    on conflict do nothing;

  insert into auth.users(id, email) values (v_u1,'coord@test.local'), (v_u2,'otro@test.local')
    on conflict do nothing;
  insert into usuarios(id, organizacion_id, email, nombre_completo)
    values (v_u1, v_org1, 'coord@test.local','Coordinador Prueba'),
           (v_u2, v_org2, 'otro@test.local','Usuario Otra Org')
    on conflict do nothing;

  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_u1, id, v_org1 from roles where codigo='coordinador' on conflict do nothing;
  insert into usuario_roles(usuario_id, rol_id, organizacion_id)
    select v_u2, id, v_org2 from roles where codigo='coordinador' on conflict do nothing;
  insert into usuario_scopes(usuario_id, organizacion_id, eleccion_id, tipo)
    values (v_u1, v_org1, v_ele, 'global'), (v_u2, v_org2, null, 'global')
    on conflict do nothing;

  -- Candidato de prueba (RN-16: el responsable es un supervisor o un concejal)
  insert into personas(organizacion_id, ci, nombres, apellidos)
    values (v_org1,'1000001','Responsable','De Prueba') on conflict do nothing;
  select id into v_resp from personas where organizacion_id=v_org1 and ci='1000001';
  select id into v_cand from candidatos where organizacion_id=v_org1 and nombre_publico='Venus Nuñez';

  -- Cupo de 2 para probar el bloqueo
  insert into cupos(organizacion_id, eleccion_id, ambito, candidato_id, limite)
    values (v_org1, v_ele, 'candidato', v_cand, 2) on conflict do nothing;

  -- Serie de folios 1..3
  insert into folios_series(id, organizacion_id, eleccion_id, tipo_documento, desde, hasta)
    values ('00000000-0000-0000-0000-0000000000f1', v_org1, v_ele, 'contrato', 1, 3)
    on conflict do nothing;
  insert into folios(serie_id, numero)
    select '00000000-0000-0000-0000-0000000000f1', g from generate_series(1,3) g
    on conflict do nothing;
end $$;

-- A partir de acá las RPC se ejecutan como el coordinador de prueba.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', false);

\echo '== 1. Normalizadores =='
do $$
begin
  perform test_falla_si(fn_normalizar_ci('4349952.0') <> '4349952', 'CI de Excel (4349952.0) se normaliza');
  perform test_falla_si(fn_normalizar_ci('') is not null,            'CI vacío devuelve null');
  perform test_falla_si(fn_normalizar_ci('abc') is not null,         'CI no numérico devuelve null');
  perform test_falla_si(fn_normalizar_telefono('0992511770') <> '+595992511770', 'Teléfono local a E.164');
  perform test_falla_si(fn_normalizar_telefono('595982387660') <> '+595982387660','Teléfono con prefijo país');
  perform test_falla_si(fn_normalizar_telefono('0975') is not null,  'Teléfono truncado (0975) queda null');
  perform test_falla_si(fn_normalizar_telefono('098') is not null,   'Teléfono truncado (098) queda null');
end $$;

\echo '== 2. CI obligatorio y con formato (D-18) =='
do $$
declare ok boolean := false;
begin
  begin
    insert into personas(organizacion_id, ci, nombres) values
      ('00000000-0000-0000-0000-0000000000a1', '0', 'Sin CI');
  exception when check_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Un CI inválido es rechazado por CHECK');

  ok := false;
  begin
    insert into personas(organizacion_id, ci, nombres) values
      ('00000000-0000-0000-0000-0000000000a1', null, 'Sin CI');
  exception when not_null_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Un CI nulo es rechazado (NOT NULL)');
end $$;

\echo '== 3. Un CI, una participación activa por elección (los 64 duplicados) =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ele uuid := '00000000-0000-0000-0000-0000000000e2';
  v_p uuid; v_u uuid := '00000000-0000-0000-0000-000000000501'; v_cand_t uuid; ok boolean := false;
begin
  select id into v_cand_t from candidatos where organizacion_id=v_org and nombre_publico='Venus Nuñez';
  insert into personas(organizacion_id, ci, nombres, apellidos)
    values (v_org,'4485876','Daniel','Britez') returning id into v_p;

  insert into choferes(organizacion_id, persona_id, eleccion_id, estado, declarado_por, responsable_candidato_id)
    values (v_org, v_p, v_ele, 'activo', v_u, v_cand_t);

  begin  -- el mismo CI otra vez, como en la planilla real (filas 32, 382 y 602)
    insert into choferes(organizacion_id, persona_id, eleccion_id, estado, declarado_por, responsable_candidato_id)
      values (v_org, v_p, v_ele, 'activo', v_u, v_cand_t);
  exception when unique_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'El segundo chofer con el mismo CI es rechazado');

  -- pero sí puede participar en otra elección (antecedentes históricos)
  insert into choferes(organizacion_id, persona_id, eleccion_id, estado, declarado_por, responsable_candidato_id)
    values (v_org, v_p, '00000000-0000-0000-0000-0000000000e1', 'activo', v_u, v_cand_t);
  perform test_ok('El mismo CI sí puede participar en otra elección');
end $$;

\echo '== 4. Responsable declarado obligatorio (RN-16 / D-14) =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1'; v_p uuid; ok boolean := false;
begin
  insert into personas(organizacion_id, ci, nombres) values (v_org,'2000002','Sin Responsable')
    returning id into v_p;
  begin
    insert into choferes(organizacion_id, persona_id, eleccion_id, estado, declarado_por)
      values (v_org, v_p, '00000000-0000-0000-0000-0000000000e2', 'activo',
              '00000000-0000-0000-0000-000000000501');
  exception when check_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Un chofer sin responsable declarado es rechazado (ni supervisor ni concejal)');
end $$;

\echo '== 5. Una sola asignación vigente por chofer (D-17) =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ele uuid := '00000000-0000-0000-0000-0000000000e2';
  v_ch uuid; v_c1 uuid; v_c2 uuid; ok boolean := false;
begin
  select c.id into v_ch from choferes c join personas p on p.id=c.persona_id
   where p.ci='4485876' and c.eleccion_id=v_ele;
  select id into v_c1 from candidatos where nombre_publico='Venus Nuñez' and organizacion_id=v_org;
  select id into v_c2 from candidatos where nombre_publico='Negro Nuñez' and organizacion_id=v_org;

  insert into asignaciones(chofer_id, eleccion_id, candidato_id) values (v_ch, v_ele, v_c1);
  begin  -- el caso real: el mismo chofer imputado a dos concejales
    insert into asignaciones(chofer_id, eleccion_id, candidato_id) values (v_ch, v_ele, v_c2);
  exception when unique_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Un chofer no puede tener dos asignaciones vigentes');

  perform fn_reasignar_chofer(v_ch, v_c2, null, null, 'prueba de reasignación');
  perform test_falla_si(
    (select count(*) from asignaciones where chofer_id=v_ch) <> 2,
    'Reasignar cierra la vigente y abre otra (queda el historial)');
end $$;

\echo '== 6. Cupo en cascada con bloqueo (D-05) =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ele uuid := '00000000-0000-0000-0000-0000000000e2';
  v_c uuid; v_p uuid; v_ch uuid; v_cand_t uuid;
  v_u uuid := '00000000-0000-0000-0000-000000000501'; ok boolean := false; i int;
begin
  select id into v_c from candidatos where nombre_publico='Venus Nuñez' and organizacion_id=v_org;
  v_cand_t := v_c;

  for i in 1..2 loop   -- el cupo es 2
    insert into personas(organizacion_id, ci, nombres) values (v_org, (3000000+i)::text, 'Cupo '||i)
      returning id into v_p;
    insert into choferes(organizacion_id, persona_id, eleccion_id, estado, declarado_por, responsable_candidato_id)
      values (v_org, v_p, v_ele, 'activo', v_u, v_cand_t) returning id into v_ch;
    perform fn_consumir_cupo_cascada(v_ele, v_c, null, null, v_ch, null);
  end loop;
  perform test_ok('Se consumen los 2 lugares del cupo');

  insert into personas(organizacion_id, ci, nombres) values (v_org,'3000003','Cupo 3')
    returning id into v_p;
  insert into choferes(organizacion_id, persona_id, eleccion_id, estado, declarado_por, responsable_candidato_id)
    values (v_org, v_p, v_ele, 'activo', v_u, v_cand_t) returning id into v_ch;
  begin
    perform fn_consumir_cupo_cascada(v_ele, v_c, null, null, v_ch, null);
  exception when check_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'El tercer alta se bloquea por CUPO_AGOTADO');

  perform test_falla_si(
    (select usado from v_cupos_consumo where candidato_id = v_c) <> 2,
    'La vista de consumo informa 2 usados');
end $$;

\echo '== 7. Folios sin repetición =='
do $$
declare f1 uuid; f2 uuid; f3 uuid; ok boolean := false;
begin
  f1 := fn_asignar_folio('00000000-0000-0000-0000-0000000000f1','contrato', gen_random_uuid());
  f2 := fn_asignar_folio('00000000-0000-0000-0000-0000000000f1','contrato', gen_random_uuid());
  f3 := fn_asignar_folio('00000000-0000-0000-0000-0000000000f1','contrato', gen_random_uuid());
  perform test_falla_si(f1 = f2 or f2 = f3 or f1 = f3, 'Tres folios consecutivos son distintos');
  begin
    perform fn_asignar_folio('00000000-0000-0000-0000-0000000000f1','contrato', gen_random_uuid());
  exception when check_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'La serie agotada corta con SERIE_AGOTADA');
end $$;

\echo '== 8. Doble pago imposible =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ele uuid := '00000000-0000-0000-0000-0000000000e2';
  v_ch uuid; ok boolean := false;
begin
  select c.id into v_ch from choferes c join personas p on p.id=c.persona_id
   where p.ci='4485876' and c.eleccion_id=v_ele;
  insert into pagos_finales(organizacion_id, chofer_id, eleccion_id) values (v_org, v_ch, v_ele);
  begin
    insert into pagos_finales(organizacion_id, chofer_id, eleccion_id) values (v_org, v_ch, v_ele);
  exception when unique_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Un chofer no puede tener dos pagos finales vigentes');
end $$;

\echo '== 9. Lista negra: motivo "otro" exige detalle (D-06) =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1'; v_p uuid; ok boolean := false;
begin
  select id into v_p from personas where organizacion_id=v_org and ci='4485876';
  begin
    insert into lista_negra(organizacion_id, persona_id, motivo_codigo, registrado_por)
      values (v_org, v_p, 'otro', '00000000-0000-0000-0000-000000000501');
  exception when check_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Motivo "otro" sin detalle es rechazado');

  insert into lista_negra(organizacion_id, persona_id, motivo_codigo, registrado_por)
    values (v_org, v_p, 'incumplio_operativo', '00000000-0000-0000-0000-000000000501');
  perform test_falla_si(
    (select vigente_hasta from lista_negra where persona_id=v_p and motivo_codigo='incumplio_operativo') is not null,
    'La vigencia por defecto es indefinida');
end $$;

\echo '== 10. Excepción: el aprobador no puede ser el solicitante =='
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_u uuid := '00000000-0000-0000-0000-000000000501'; ok boolean := false;
begin
  begin
    insert into excepciones(organizacion_id, eleccion_id, tipo, motivo,
                            solicitado_por, aprobado_por, estado)
      values (v_org,'00000000-0000-0000-0000-0000000000e2','cupo','prueba', v_u, v_u, 'aprobada');
  exception when check_violation then ok := true;
  end;
  perform test_falla_si(not ok, 'Una excepción autoaprobada es rechazada');
end $$;

\echo '== 11. La bitácora de auditoría se escribe sola =='
do $$
declare n int;
begin
  select count(*) into n from audit_log where tabla='choferes' and operacion='INSERT';
  perform test_falla_si(n = 0, 'Los INSERT en choferes quedan en audit_log');
  select count(*) into n from audit_log where tabla='asignaciones' and operacion='UPDATE';
  perform test_falla_si(n = 0, 'Los UPDATE en asignaciones quedan en audit_log');
end $$;

\echo '== 12. RLS: aislamiento entre organizaciones (D-12) =='
do $$
declare n int;
begin
  -- Usuario de la organización 1
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
  set local role authenticated;
  select count(*) into n from choferes;
  perform test_falla_si(n = 0, 'El usuario de la org 1 ve sus choferes ('||n||')');
  reset role;

  -- Usuario de la organización 2: no debe ver NADA de la 1
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
  set local role authenticated;
  select count(*) into n from choferes;
  perform test_falla_si(n <> 0, 'El usuario de la org 2 ve 0 choferes de la org 1');
  select count(*) into n from personas;
  perform test_falla_si(n <> 0, 'El usuario de la org 2 ve 0 personas de la org 1');
  select count(*) into n from cupos;
  perform test_falla_si(n <> 0, 'El usuario de la org 2 ve 0 cupos de la org 1');
  reset role;
end $$;

\echo '== 13. RLS: nadie escribe ni borra la bitácora =='
do $$
declare ok boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
  set local role authenticated;
  begin
    insert into audit_log(tabla, operacion) values ('falso','INSERT');
  exception when others then ok := true;
  end;
  perform test_falla_si(not ok, 'Un usuario autenticado no puede escribir en audit_log');

  ok := false;
  begin
    delete from choferes;
  exception when others then ok := true;
  end;
  perform test_falla_si(not ok, 'Un usuario autenticado no puede borrar choferes');
  reset role;
end $$;

\echo ''
\echo '================================================'
\echo '  TODOS LOS INVARIANTES PASARON'
\echo '================================================'
