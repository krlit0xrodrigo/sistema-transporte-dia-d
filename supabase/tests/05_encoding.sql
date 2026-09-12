-- =====================================================================
-- Reparación de la doble codificación (migración 0010).
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/05_encoding.sql
--
-- Se fabrican los valores rotos EXACTOS que se vieron en producción, se
-- vuelve a correr el archivo de migración tal cual está en el repo, y se
-- comprueba que quedan bien y que lo que estaba bien no se tocó.
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

\echo '== 1. La función invierte la doble codificación =='
do $$
begin
  perform test_falla_si(
    fn_reparar_doble_encoding('Barrio El NiÃ±o') <> 'Barrio El Niño',
    'Barrio El NiÃ±o → Barrio El Niño');
  perform test_falla_si(
    fn_reparar_doble_encoding('Barrio MarÃ­a Auxiliadora') <> 'Barrio María Auxiliadora',
    'Barrio MarÃ­a Auxiliadora → Barrio María Auxiliadora');
  perform test_falla_si(
    fn_reparar_doble_encoding('TekoporÃ¡') <> 'Tekoporá',
    'TekoporÃ¡ → Tekoporá');
  perform test_falla_si(
    fn_reparar_doble_encoding('Barrio PaÃ±ete') <> 'Barrio Pañete',
    'Barrio PaÃ±ete → Barrio Pañete');
end $$;

\echo '== 2. Un texto sano no se toca =='
do $$
begin
  perform test_falla_si(fn_reparar_doble_encoding('Barrio El Niño') <> 'Barrio El Niño',
    'Un nombre ya correcto pasa intacto');
  perform test_falla_si(fn_reparar_doble_encoding('Venus Nuñez') <> 'Venus Nuñez',
    'Los nombres que cargó el importador pasan intactos');
  perform test_falla_si(fn_reparar_doble_encoding('Remansito') <> 'Remansito',
    'Un nombre sin acentos pasa intacto');
  perform test_falla_si(fn_reparar_doble_encoding(null) is not null,
    'Un nulo sigue siendo nulo');
end $$;

\echo '== 3. La migración repara las filas rotas de la tabla =='
do $$
declare v_org uuid := '00000000-0000-0000-0000-0000000000a1'; n int;
begin
  -- Se rompen a propósito, reproduciendo EXACTAMENTE lo que hizo el
  -- cliente de psql en Windows: escribir el texto como bytes UTF-8 y
  -- leerlos como WIN1252. Escribir el resultado a mano es frágil —la raya
  -- larga se corrompe en tres caracteres, uno de ellos una comilla curva
  -- que un editor normaliza sin avisar—, así que se genera.
  update barrios set nombre = convert_from(convert_to(nombre, 'UTF8'), 'WIN1252')
   where organizacion_id = v_org and nombre in ('Barrio El Niño', 'Tekoporá');
  update elecciones set nombre = convert_from(convert_to(nombre, 'UTF8'), 'WIN1252')
   where nombre = 'Día D — Municipales Villa Hayes';

  select count(*) into n from barrios where nombre ~ '[ÃÂâ]';
  perform test_falla_si(n < 2, 'Escenario listo: hay barrios con doble codificación');
end $$;

\ir ../migrations/20260916001000_reparar_encoding_catalogos.sql

do $$
declare n int;
begin
  select count(*) into n from barrios where nombre = 'Barrio El Niño';
  perform test_falla_si(n <> 1, 'Barrio El Niño quedó reparado');

  select count(*) into n from barrios where nombre = 'Tekoporá';
  perform test_falla_si(n <> 1, 'Tekoporá quedó reparado');

  select count(*) into n from elecciones where nombre = 'Día D — Municipales Villa Hayes';
  perform test_falla_si(n <> 1, 'La elección recuperó su raya larga y su tilde');

  select count(*) into n from barrios where nombre ~ '[ÃÂâ]';
  perform test_falla_si(n <> 0, 'No queda ningún barrio con doble codificación');
end $$;

\echo '== 4. Idempotente: correrla de nuevo no rompe lo ya reparado =='
\ir ../migrations/20260916001000_reparar_encoding_catalogos.sql

do $$
declare n int;
begin
  select count(*) into n from barrios where nombre = 'Barrio El Niño';
  perform test_falla_si(n <> 1, 'La segunda corrida deja Barrio El Niño intacto');
  select count(*) into n from barrios where nombre = 'Tekoporá';
  perform test_falla_si(n <> 1, 'La segunda corrida deja Tekoporá intacto');
end $$;

\echo '== 5. Los datos del importador no se tocan =='
do $$
declare n int;
begin
  -- Las personas las cargó psycopg en UTF-8: la migración no las incluye
  -- siquiera en su lista de tablas.
  select count(*) into n from personas where nombre_completo ~ '[ÃÂâ]';
  perform test_falla_si(n <> 0, 'Ninguna persona tiene doble codificación');
end $$;

\echo ''
\echo '================================================'
\echo '  CODIFICACIÓN DE CATÁLOGOS: EN VERDE'
\echo '================================================'
