# Despliegue y carga inicial

Proyecto Supabase: `msivgrwqwcgnxiwejges` ·
API: `https://msivgrwqwcgnxiwejges.supabase.co/rest/v1/`

---

## 1. Sobre las claves — leelo antes de mandarme nada

**No me pases la `service_role` key ni la contraseña de la base por chat.** No las necesito, y
`docs/security.md` §S2 dice exactamente esto: esa clave evita RLS por diseño y un chat no es
lugar para guardarla. Los comandos de abajo los corrés vos con tus credenciales; yo trabajo
contra una copia local del esquema.

Lo que sí es público y se puede compartir sin problema: la URL del proyecto y la `anon` key.
Están pensadas para vivir en el navegador.

Si en algún momento hace falta que yo aplique algo directo, avisame y vemos la forma segura
(un usuario de base con permisos acotados y temporal), no la clave maestra.

## 2. Aplicar el esquema

Necesitás la CLI de Supabase y la contraseña de la base
(Project Settings → Database → Database password).

```bash
npm install -g supabase

cd sistema-transporte-dia-d
supabase link --project-ref msivgrwqwcgnxiwejges
supabase db push                 # aplica las 5 migraciones en orden
```

Después, el seed de catálogos:

```bash
export DATABASE_URL='postgresql://postgres:<TU_PASSWORD>@db.msivgrwqwcgnxiwejges.supabase.co:5432/postgres'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Verificación rápida — tiene que dar 45, 45 y 124:

```bash
psql "$DATABASE_URL" -tAc "
  select (select count(*) from information_schema.tables
           where table_schema='public' and table_type='BASE TABLE') as tablas,
         (select count(*) from pg_tables t join pg_class c on c.relname=t.tablename
           where t.schemaname='public' and c.relrowsecurity) as con_rls,
         (select count(*) from pg_policies where schemaname='public') as politicas;"
```

## 3. Crear el primer usuario

El importador necesita un usuario para `declarado_por` (RN-16). Creá tu cuenta en
Authentication → Users → *Add user*, y después vinculala:

```sql
-- reemplazá el uuid por el de tu usuario en Authentication → Users
insert into usuarios (id, organizacion_id, email, nombre_completo, mfa_habilitado)
select '<TU_AUTH_UID>', id, '<TU_EMAIL>', '<TU NOMBRE>', false
  from organizaciones where codigo = 'dia-d-vh';

insert into usuario_roles (usuario_id, rol_id, organizacion_id)
select '<TU_AUTH_UID>', r.id, o.id
  from roles r, organizaciones o
 where r.codigo = 'super_admin' and o.codigo = 'dia-d-vh';

insert into usuario_scopes (usuario_id, organizacion_id, eleccion_id, tipo)
select '<TU_AUTH_UID>', o.id, e.id, 'global'
  from organizaciones o join elecciones e on e.organizacion_id = o.id
 where o.codigo = 'dia-d-vh' and e.estado = 'activa';
```

## 4. Cargar los datos

En orden. El padrón va primero porque el importador de choferes lo usa para verificar.

```bash
export DATABASE_URL='postgresql://postgres:<TU_PASSWORD>@db.msivgrwqwcgnxiwejges.supabase.co:5432/postgres'
export IMPORT_USER_ID='<TU_AUTH_UID>'

# 1. Padrón — 35.192 personas + 95.427 registros de participación
python3 scripts/import/padron.py padron_villa_hayes-utf8.csv

# 2. Choferes — primero SIN escribir, para leer el informe
python3 scripts/import/choferes.py "Logistica Dia D Dr Lopez Intendente 2.xlsx"

# 3. Choferes — aplicar
python3 scripts/import/choferes.py "Logistica Dia D Dr Lopez Intendente 2.xlsx" --confirmar

# 4. Antecedentes del 07/06/2026 (confiabilidad baja, ver el aviso del script)
python3 scripts/import/antecedentes.py "Reporte_Choferes_07062026 1.xlsx" --confirmar
```

Requisitos: `pip install psycopg[binary] pandas openpyxl`.

El paso 2 no escribe nada en el dominio: llena el staging y muestra el informe. Leelo antes de
correr el 3.

## 5. Qué tiene que dar

Estos números salieron de correr la carga completa contra PostgreSQL 16 con los archivos reales:

| | |
|---|---|
| `padron_electoral` | 35.192 |
| `padron_participacion` | 95.427 |
| Filas leídas de la planilla | 695 |
| Rechazadas sin cédula (D-18) | 20 |
| Cédulas distintas | 605 |
| **Choferes activos creados** | **604** |
| Apariciones archivadas (D-03) | 70 |
| Verificados contra el padrón | 534 |
| Fuera del padrón (D-21) | 70 |
| Nombre que no coincide con el padrón | 1 |
| Vehículos | 400 |
| Supervisores | 22 |
| Antecedentes del 07/06 | 590 |
| **CI duplicados activos** | **0** |

Si algún número se corre mucho, algo cambió en los archivos: revisá el informe del paso 2 antes
de confirmar.

## 6. Reversa

La importación es idempotente por hash: el mismo archivo no entra dos veces. Para rehacer la
carga desde cero en un entorno que no sea producción:

```sql
truncate apariciones_origen, asignaciones, chofer_vehiculos, choferes,
         antecedentes, vehiculos, personas,
         importacion_filas, importaciones cascade;
```

En producción **no se trunca**: se da de baja con `fn_baja_chofer`, que conserva el historial.
