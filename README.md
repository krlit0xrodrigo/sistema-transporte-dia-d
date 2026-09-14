# Sistema de gestión de choferes — Logística Día D

Villa Hayes, Presidente Hayes, Paraguay.

> **Estado: SPRINT — los 5 días cerrados.**
> Base de datos: **45 tablas, 124 políticas RLS, 76 invariantes en verde.**
> Datos reales cargados: **padrón de 35.192 · 604 choferes activos · 0 cédulas duplicadas.**
> Aplicación: alta, búsqueda, ficha, cupos, caja, folios, lista negra, GPS, reportes y
> exportación —incluida la planilla imprimible que reemplaza las 21 hojas manuales.
>
> 🗓️ **Sistema operativo: miércoles 16 de septiembre. Día D: domingo 4 de octubre.**
> Ver [`ROADMAP.md`](ROADMAP.md).

## Probar la base sin instalar nada

```bash
./scripts/test-db.sh
```

Levanta un PostgreSQL efímero, aplica las migraciones y el seed, y corre los **76 invariantes**
críticos (esquema y RLS, caja y folios, exportación y GPS). Sin Supabase, sin Docker, sin red.
Con `--no-tests` deja la base limpia para correr los importadores.

## Cargar los datos

```bash
export DATABASE_URL=...   # ver docs/despliegue.md
python3 scripts/import/padron.py padron_villa_hayes-utf8.csv
python3 scripts/import/choferes.py "Logistica Dia D.xlsx"              # informe, sin escribir
python3 scripts/import/choferes.py "Logistica Dia D.xlsx" --confirmar
python3 scripts/import/antecedentes.py "Reporte_Choferes.xlsx" --confirmar
```

## Qué es

Sistema web para administrar la logística de transporte de un operativo electoral: choferes,
vehículos, asignación a candidatos y barrios, supervisión, cupos, contratos con folio,
combustible, anticipos y pagos, verificación de actividad por GPS (Traccar), y auditoría
completa de todo lo anterior.

Reemplaza un conjunto de planillas Excel/Google Sheets cuya auditoría
(`docs/audit-datos.md`) reveló 64 CI duplicados con imputación cruzada entre candidatos,
cero registro digital de contratos y pagos, y clasificación de actividad GPS hecha por
coincidencia de nombres.

## Stack

Next.js + TypeScript + Tailwind + shadcn/ui · Supabase (PostgreSQL + Auth + Storage) ·
Vercel · Cloudflare · Google Sheets API · Traccar API.

## Documentación

| Documento | Para qué |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglas de trabajo. **Leer primero.** |
| [`SPEC.md`](SPEC.md) | Alcance, actores, reglas de negocio |
| [`ROADMAP.md`](ROADMAP.md) | **Sprint de 5 días y endurecimiento hasta el 4 de octubre** |
| [`docs/audit-datos.md`](docs/audit-datos.md) | Auditoría de las planillas de origen |
| [`docs/audit-padron.md`](docs/audit-padron.md) | Auditoría del padrón (35.192 registros) |
| [`docs/despliegue.md`](docs/despliegue.md) | **Aplicar el esquema y cargar los datos** |
| [`docs/architecture.md`](docs/architecture.md) | Arquitectura y decisiones (12 ADR) |
| [`docs/database.md`](docs/database.md) | 45 tablas, relaciones, restricciones, RLS |
| [`docs/permissions.md`](docs/permissions.md) | 9 roles y matriz de permisos |
| [`docs/workflows.md`](docs/workflows.md) | Flujos operativos |
| [`docs/security.md`](docs/security.md) | Riesgos, controles, cumplimiento, testing |
| [`docs/traccar.md`](docs/traccar.md) | Integración GPS |
| [`docs/decisiones-pendientes.md`](docs/decisiones-pendientes.md) | Registro de decisiones — **21 resueltas, 0 abiertas** |

## Datos y privacidad

Este sistema maneja datos personales identificatorios y afinidad política de personas reales.
Nunca subir datos reales a tests, fixtures, issues o prompts. Ver `docs/security.md`.

## Correr la aplicación

```bash
npm install
cp .env.example .env.local     # completá NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

La `anon key` es pública por diseño y va en el navegador. La `service_role` key
**nunca** va en un archivo `NEXT_PUBLIC_*`: evita RLS por completo.

| Comando | Para qué |
|---|---|
| `npm run dev` | Desarrollo en `localhost:3000` |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `./scripts/test-db.sh` | Postgres efímero + migraciones + invariantes |
