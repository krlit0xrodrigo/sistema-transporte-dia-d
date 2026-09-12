# Sistema de gestión de choferes — Logística Día D

Villa Hayes, Presidente Hayes, Paraguay.

> **Estado: SPRINT — Día 1 de 5.**
> Base de datos escrita y probada: **45 tablas, 124 políticas RLS, 28 invariantes en verde.**
> Las 21 decisiones resueltas.
>
> 🗓️ **Sistema operativo: miércoles 16 de septiembre. Día D: domingo 4 de octubre.**
> Ver [`ROADMAP.md`](ROADMAP.md).

## Probar la base sin instalar nada

```bash
./scripts/test-db.sh
```

Levanta un PostgreSQL efímero, aplica las migraciones y el seed, y corre los invariantes
críticos. Sin Supabase, sin Docker, sin red.

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
| [`ROADMAP.md`](ROADMAP.md) | **Calendario de 21 días al 4 de octubre**, MVP y orden de recorte |
| [`docs/audit-datos.md`](docs/audit-datos.md) | Auditoría de las planillas de origen |
| [`docs/audit-padron.md`](docs/audit-padron.md) | Auditoría del padrón (35.192 registros) |
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
