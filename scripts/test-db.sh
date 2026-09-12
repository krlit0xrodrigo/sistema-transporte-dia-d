#!/usr/bin/env bash
# =====================================================================
# Levanta un PostgreSQL efímero, aplica migraciones + seed y corre los
# invariantes. Sin Supabase, sin Docker, sin red.
#
#   ./scripts/test-db.sh
#
# Requiere: postgresql-16 (server + client).
# =====================================================================
set -euo pipefail

PGPORT="${PGPORT:-54329}"
PGDATA="${PGDATA:-/var/lib/postgresql/pgdata-test}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
SOCK="${SOCK:-/tmp}"
# --no-tests deja la base con migraciones + seed y nada más. Se usa para
# correr los importadores contra datos reales sin los datos del test.
CORRER_TESTS=1
[[ "${1:-}" == "--no-tests" ]] && CORRER_TESTS=0 && shift || true
DB="${DB:-diad_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql_() { psql -h "$SOCK" -p "$PGPORT" -U postgres "$@"; }

if ! psql_ -tAc "select 1" >/dev/null 2>&1; then
  echo "→ levantando PostgreSQL en :$PGPORT"
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"
  chown -R postgres:postgres "$(dirname "$PGDATA")" 2>/dev/null || true
  chmod 700 "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -E UTF8 --locale=C" >/dev/null
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k $SOCK' -l /tmp/pg-test.log start" >/dev/null
  sleep 2
fi

echo "→ base limpia"
psql_ -tAc "drop database if exists $DB" >/dev/null
psql_ -tAc "create database $DB" >/dev/null

# Stub del esquema auth de Supabase, para poder probar sin Supabase.
psql_ -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin; end if;
end $$;
SQL

echo "→ migraciones"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '   %s\n' "$(basename "$f")"
  psql_ -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f"
done

echo "→ seed"
psql_ -d "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/seed.sql"

if [[ $CORRER_TESTS -eq 1 ]]; then
  echo "→ invariantes"
  # En orden: 01 crea los datos sintéticos, 02 la caja sobre ellos,
  # 03 exporta y vincula GPS sobre lo que dejaron los dos anteriores.
  for t in "$ROOT"/supabase/tests/*.sql; do
    printf '   %s\n' "$(basename "$t")"
    psql_ -d "$DB" -v ON_ERROR_STOP=1 -f "$t" 2>&1 \
      | grep -E "OK |FALL|^==|ERROR|VERDE|PASARON" \
      | sed 's/^psql:[^ ]* //; s/^NOTICE:  //'
  done
else
  echo "→ invariantes omitidos (--no-tests): base limpia para importar"
fi

echo
echo "→ resumen del esquema"
psql_ -d "$DB" -tAc "
  select 'tablas:      ' || count(*) from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE'
  union all select 'con RLS:     ' || count(*) from pg_tables t
    join pg_class c on c.relname=t.tablename where t.schemaname='public' and c.relrowsecurity
  union all select 'políticas:   ' || count(*) from pg_policies where schemaname='public'
  union all select 'sin RLS:     ' || coalesce(string_agg(tablename, ', '), 'ninguna') from pg_tables t
    join pg_class c on c.relname=t.tablename
   where t.schemaname='public' and not c.relrowsecurity;"
