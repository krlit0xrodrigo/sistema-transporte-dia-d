-- =====================================================================
-- 0010 · Reparar los catálogos con doble codificación.
--
-- QUÉ SE VE
-- ---------
-- En producción, los nombres que puso `seed.sql` están mal:
--
--     Barrio El NiÃ±o            debería ser  Barrio El Niño
--     Barrio MarÃ­a Auxiliadora  debería ser  Barrio María Auxiliadora
--     Barrio PaÃ±ete             debería ser  Barrio Pañete
--     Barrio Rosa MÃ­stica       debería ser  Barrio Rosa Mística
--     TekoporÃ¡                  debería ser  Tekoporá
--     DÃ­a D â€" Municipales...   debería ser  Día D — Municipales...
--
-- QUÉ PASÓ
-- --------
-- El archivo `seed.sql` está en UTF-8, pero se aplicó desde un cliente
-- cuyo `client_encoding` era WIN1252 —el valor por defecto de psql en la
-- consola de Windows—. PostgreSQL creyó que cada byte era un carácter
-- Windows-1252 y lo volvió a codificar a UTF-8. Resultado: cada carácter
-- acentuado quedó guardado como los dos o tres caracteres que lo forman.
--
-- Se confirma mirando quién insertó qué: los nombres que cargó el
-- importador de Python (`Negro Nuñez`, `Venus Nuñez`) están perfectos,
-- porque psycopg habla UTF-8 siempre. Sólo está mal lo que entró por el
-- seed.
--
-- Esto importa más de lo que parece: `barrios.nombre` es el título de cada
-- hoja de la planilla impresa y el corte de página del reparto. Seiscientos
-- choferes iban a recibir una hoja que dice «Barrio El NiÃ±o».
--
-- CÓMO SE REPARA
-- --------------
-- La operación inversa exacta: tomar el texto guardado, escribirlo de
-- vuelta como bytes WIN1252 y leer esos bytes como UTF-8.
--
--     convert_from(convert_to(nombre, 'WIN1252'), 'UTF8')
--
-- Se aplica SÓLO a las filas que tienen la marca del problema (`Ã`, `â`,
-- `Â`), y cada una se convierte dentro de su propio bloque de excepción:
-- si una fila no se puede convertir, queda como está y la migración sigue.
-- Ninguna fila limpia se toca.
--
-- IDEMPOTENTE: después de repararla, la fila ya no tiene la marca, así que
-- una segunda corrida la ignora.
--
-- Y PARA QUE NO VUELVA A PASAR: aplicar el seed con el encoding explícito.
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--          -c "set client_encoding to 'UTF8'" -f supabase/seed.sql
--
--     o, en PowerShell:   $env:PGCLIENTENCODING = "UTF8"
-- =====================================================================

create or replace function fn_reparar_doble_encoding(p text) returns text
language plpgsql immutable as $$
begin
  -- La marca de la doble codificación. Sin ella, el texto está bien.
  if p is null or p !~ '[ÃÂâ]' then
    return p;
  end if;
  return convert_from(convert_to(p, 'WIN1252'), 'UTF8');
exception when others then
  -- Texto que no se puede representar en WIN1252: no era doble
  -- codificación. Se devuelve intacto.
  return p;
end $$;

comment on function fn_reparar_doble_encoding(text) is
  'Deshace UTF-8 interpretado como WIN1252. Devuelve el texto sin tocar si no tiene la marca del problema.';

do $$
declare
  v_tabla   text;
  v_columna text;
  n int;
  total int := 0;
begin
  -- Sólo catálogos, y sólo las columnas de texto que muestra la interfaz.
  -- Ni personas, ni choferes, ni padrón: esos los cargó el importador en
  -- UTF-8 y están correctos. Tocarlos sería arreglar lo que no está roto.
  for v_tabla, v_columna in
    select * from (values
      ('barrios',           'nombre'),
      ('elecciones',        'nombre'),
      ('locales_votacion',  'nombre'),
      ('locales_votacion',  'zona'),
      ('roles',             'nombre'),
      ('roles',             'descripcion'),
      ('permisos',          'descripcion'),
      ('organizaciones',    'nombre'),
      ('origenes_planilla', 'nombre'),
      ('origenes_planilla', 'descripcion')
    ) as t(tabla, columna)
  loop
    execute format(
      'update %I set %I = fn_reparar_doble_encoding(%I) where %I ~ ''[ÃÂâ]''',
      v_tabla, v_columna, v_columna, v_columna);
    get diagnostics n = row_count;
    if n > 0 then
      raise notice '  %.% → % fila(s) reparada(s)', v_tabla, v_columna, n;
      total := total + n;
    end if;
  end loop;

  if total = 0 then
    raise notice '  (nada que reparar: los catálogos ya están en UTF-8)';
  else
    raise notice '';
    raise notice '  TOTAL: % valores reparados', total;
  end if;
end $$;

-- Verificación: no queda ningún catálogo con la marca del problema.
do $$
declare n int;
begin
  select count(*) into n from barrios where nombre ~ '[ÃÂâ]';
  if n > 0 then
    raise exception 'VERIFICACIÓN FALLIDA: % barrio(s) siguen con doble codificación', n;
  end if;
  select count(*) into n from elecciones where nombre ~ '[ÃÂâ]';
  if n > 0 then
    raise exception 'VERIFICACIÓN FALLIDA: % elección(es) siguen con doble codificación', n;
  end if;
  raise notice '  ✓ catálogos sin doble codificación';
end $$;
