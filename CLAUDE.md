# CLAUDE.md — Reglas de trabajo del proyecto

> Documento de contrato entre el equipo humano y cualquier agente de IA que trabaje en este
> repositorio. Se lee **antes** de cualquier cambio.

**Proyecto:** Sistema de gestión de choferes — Logística Día D, Villa Hayes (Presidente Hayes, Paraguay)
**Repositorio:** `github.com/krlit0xrodrigo/sistema-transporte-dia-d` (rama `main`)
**Estado actual:** `SPRINT — Día 2 de 5 cerrado`. Base de datos escrita y probada (45 tablas,
124 políticas RLS, 28 invariantes en verde) y **datos reales adentro**: padrón de 35.192,
604 choferes activos, 0 duplicados.
**Decisiones:** las 21 resueltas. Ver `docs/decisiones-pendientes.md`.
**🗓️ Sistema operativo: miércoles 16 de septiembre · Día D: domingo 4 de octubre.**
**Última actualización:** 2026-09-12 (v0.4 — sprint de 5 días)

---

## 1. Regla número uno

> **Antes de tocar el esquema, correr `./scripts/test-db.sh`. Si un invariante se pone en rojo,
> se arregla antes de seguir — no se comenta el test.**

Los invariantes que protege esa suite son los que costaron el operativo anterior: un CI una sola
vez por elección, CI obligatorio, responsable declarado, una asignación vigente, cupo con
bloqueo, folios sin repetir, un solo pago final, bitácora inviolable y aislamiento entre
organizaciones. Ninguno se negocia por velocidad.

**Alcance:** aprobado el MVP de 5 días (`ROADMAP.md` §2). Todo pedido nuevo va a la lista del
17 de septiembre en adelante.

## 2. Contexto de negocio (resumen mínimo)

El sistema administra la logística de transporte de un operativo electoral municipal
("Día D") en Villa Hayes: choferes con vehículo propio o contratado, asignados a un
candidato a concejal y a un barrio, coordinados por supervisores/referentes, con
control de cupos, contratos con folio, vales de combustible, anticipos y pago final,
y verificación de actividad real vía GPS (Traccar).

Los datos de partida son planillas Excel/Google Sheets con calidad baja
(ver `docs/audit-datos.md`).

## 3. Principios de arquitectura no negociables

1. **La identidad de una persona es el CI, no el nombre.** Toda entidad humana cuelga de
   `personas.ci` (normalizado y **obligatorio**). Nunca se deduplica por nombre.
2. **Separar persona de participación.** Una persona puede ser chofer en 2026 y supervisor en
   2028. La tabla `choferes` es una *participación en una elección*, no una persona.
3. **Todo dato operativo está particionado por `organizacion_id` y `eleccion_id`.** Sin
   excepción. Es lo que permite multi-operativo y antecedentes históricos.
4. **Nada se borra.** Borrado lógico (`deleted_at`) + bitácora de auditoría inmutable.
   Una aparición duplicada en una planilla no se elimina: se archiva en `apariciones_origen`
   y queda visible en la ficha.
5. **RLS siempre activo**, incluso en tablas de catálogo, y **siempre empezando por
   `organizacion_id`**. Una tabla sin política es una tabla sin acceso, no una tabla abierta.
6. **El importador nunca escribe directo en producción.** Todo import pasa por `staging` →
   validación → resolución de conflictos → commit.
7. **El estado de caja se registra con fecha y responsable, no con un `SI` suelto.** Firmado,
   anticipo pagado y pago finalizado son marcas con autor y timestamp; el monto es opcional.
8. **Los datos del padrón son de solo lectura**, importados como snapshot versionado, nunca
   editables desde la UI, y su consulta siempre queda registrada.

## 4. Stack acordado

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Server Components por defecto |
| Backend | Supabase (PostgreSQL 15+) | Lógica de negocio en RPC/SQL cuando toca integridad |
| Auth | Supabase Auth | Email+password con MFA obligatorio para roles de escritura |
| Hosting | Vercel | Preview deploys con base de datos separada |
| DNS/WAF | Cloudflare | Rate limiting y geo-restricción en rutas administrativas |
| Integraciones | Google Sheets API, Traccar API | Siempre vía job server-side, nunca desde el navegador |

## 5. Convenciones de código

- **Idioma:** identificadores de base de datos y dominio en **español** (`choferes`, `barrios`,
  `vales_combustible`). Código de infraestructura y utilidades en inglés. Sin mezclar dentro
  de un mismo nombre.
- **Base de datos:** `snake_case`, tablas en plural, PK `id uuid default gen_random_uuid()`,
  FK `<tabla_singular>_id`, timestamps `created_at`/`updated_at`/`deleted_at` en `timestamptz`.
- **TypeScript:** `strict: true`. Tipos de BD generados con `supabase gen types typescript`,
  nunca escritos a mano.
- **Validación:** Zod en el borde (formularios y rutas). La validación de Zod **no reemplaza**
  los `CHECK` de PostgreSQL.
- **Componentes:** `src/components/ui` solo shadcn; dominio en `src/components/<dominio>`.
- **Sin `any`, sin `@ts-ignore`** sin comentario justificando y ticket asociado.

## 6. Reglas de seguridad para agentes

- Nunca escribir claves reales en el repositorio. Solo `.env.example` con nombres.
- La `service_role` key **jamás** se usa en código que corra en el navegador ni en un Client
  Component. Solo en Route Handlers/Server Actions y jobs.
- Nunca subir datos reales (CI, teléfonos, padrón) a fixtures, tests, issues o prompts.
  Usar los generadores de datos sintéticos de `scripts/validation/`.
- Nunca ejecutar `DROP`, `TRUNCATE`, `DELETE` sin `WHERE`, ni `supabase db reset` contra un
  proyecto que no sea local.
- Cualquier migración que borre o renombre columnas requiere aprobación explícita en el PR.

## 6.bis Alcance bajo presión de calendario

Con 21 días hasta el operativo, **la variable de ajuste es el alcance, nunca las pruebas ni el
respaldo en papel.** Todo pedido nuevo va a la lista de post-4-de-octubre. Si una funcionalidad
del MVP no llega, se recorta según el orden de `ROADMAP.md` §5 y se dice en el momento, no el
2 de octubre.

## 7. Qué hacer ante información faltante

**No inventar.** Si un dato de negocio no está definido (montos, cupos, criterios de lista
negra, reglas de pago), el agente:

1. Lo registra en `docs/decisiones-pendientes.md` con un ID `D-xx`.
2. Deja el campo como nulo/configurable, no con un valor "razonable" hardcodeado.
3. Lo menciona explícitamente en el resumen del PR.

## 8. Flujo de trabajo

1. Rama por tarea: `feat/`, `fix/`, `docs/`, `chore/`.
2. Commits en español, imperativo, referenciando el documento o decisión afectada.
3. Todo PR que toque el esquema incluye: migración, migración de rollback, test de RLS y
   actualización de `docs/database.md`.
4. `main` siempre desplegable. Producción solo desde tags.

## 9. Definición de "terminado"

Una funcionalidad está terminada cuando: tiene test, tiene política RLS probada con un
usuario de cada rol, escribe en la bitácora de auditoría, aparece en la documentación y
alguien distinto del autor la ejecutó en preview.

## 10. Mapa de documentos

| Documento | Contenido |
|---|---|
| `SPEC.md` | Qué hace el sistema, alcance y fuera de alcance |
| `ROADMAP.md` | Fases, entregables y criterios de salida |
| `docs/audit-datos.md` | Auditoría de las planillas de origen (hallazgos reales) |
| `docs/audit-padron.md` | Auditoría del padrón de Villa Hayes (35.192 registros) |
| `docs/despliegue.md` | Aplicar el esquema y cargar los datos en Supabase |
| `docs/architecture.md` | Arquitectura técnica y decisiones |
| `docs/database.md` | Modelo de datos, relaciones, RLS |
| `docs/permissions.md` | Roles, permisos y matriz de acceso |
| `docs/workflows.md` | Flujos operativos (alta, consulta, lista negra, cupos, caja, import/export) |
| `docs/security.md` | Riesgos, controles, cumplimiento |
| `docs/traccar.md` | Integración GPS |
| `docs/decisiones-pendientes.md` | Decisiones que bloquean implementación |
