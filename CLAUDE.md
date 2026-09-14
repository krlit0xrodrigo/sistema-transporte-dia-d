# CLAUDE.md — Contrato de trabajo del proyecto v2

> Documento de contrato entre el equipo humano y cualquier agente de IA que trabaje en este
> repositorio. Se lee **antes** de cualquier cambio.

**Proyecto:** Sistema de Gestión de Transporte — Día D, Villa Hayes (Presidente Hayes, Paraguay)
**Repositorio:** `github.com/krlit0xrodrigo/sistema-transporte-dia-d` (rama `main`)
**Versión:** v2 — Reconstrucción profesional
**Día D:** domingo 4 de octubre de 2026
**Última actualización:** 2026-09-12

---

## 1. Regla número uno

> **Antes de tocar el esquema, correr `./scripts/test-db.sh`. Si un invariante se pone en rojo,
> se arregla antes de seguir — no se comenta el test.**

Los invariantes que protege esa suite son los que costaron el operativo anterior: un CI una sola
vez por elección, CI obligatorio, responsable declarado, una asignación vigente, cupo con
bloqueo, folios sin repetir, un solo pago final, bitácora inviolable y aislamiento entre
organizaciones. Ninguno se negocia por velocidad.

## 2. Regla fundamental: NO PROGRAMAR SIN DISEÑAR

Antes de implementar cualquier funcionalidad:

1. Entender requisitos
2. Analizar archivos fuente
3. Diseñar arquitectura
4. Diseñar modelo de datos
5. Diseñar permisos
6. Diseñar RLS
7. Diseñar UX
8. Diseñar flujos
9. Definir pruebas
10. Generar documentación
11. Presentar plan
12. **Recién después implementar**

Cada fase termina con un informe y una revisión humana.
**Ninguna fase avanza automáticamente a la siguiente.**

## 3. Contexto de negocio

El sistema administra la logística de transporte de un operativo electoral municipal
("Día D") en Villa Hayes: choferes con vehículo propio o contratado, asignados a un
candidato a concejal y a un barrio, coordinados por supervisores/referentes, con
control de cupos, contratos con folio, vales de combustible, anticipos y pago final,
y verificación de actividad real vía GPS (Traccar).

Los datos de partida son planillas Excel/Google Sheets con calidad baja
(ver `docs/audit-datos.md`).

## 4. Principio más importante: HISTÓRICO vs OPERACIÓN ACTUAL

Existen **DOS conceptos completamente diferentes** que NUNCA deben mezclarse.

### HISTÓRICO

Información correspondiente a la interna del **07/06/2026**:

- Antecedentes de quién trabajó y quién no
- Actividad histórica, km históricos
- Supervisor histórico, candidato histórico
- Apariciones históricas en planillas

### OPERACIÓN ACTUAL

Corresponde al operativo actual: **04/10/2026**

- Solo personas/choferes **explícitamente incorporados** al operativo actual
- `/choferes` comienza **VACÍO** si no existen altas actuales
- Un chofer histórico NO aparece automáticamente como chofer activo actual

### Regla de separación

Al encontrar una persona:

1. Mostrar **OPERACIÓN ACTUAL** — su estado en el operativo del 04/10/2026
2. Por separado, mostrar **ANTECEDENTES HISTÓRICOS** — participaciones pasadas

Nunca mezclar ambos conceptos en la misma vista ni en la misma consulta.

## 5. DOS PUERTAS del sistema

### 🔎 PUERTA 1 — CONSULTA

"¿Quién es esta persona?"

```
CI → Persona → Padrón → Antecedentes → Lista negra → Historial
```

### 🚗 PUERTA 2 — OPERACIÓN

"¿Quiero incorporar esta persona como chofer actual?"

```
CI → Validaciones → Cupo → Blacklist → Excepción → Alta → Asignación → Orden
```

Esto evita el error conceptual de versiones anteriores donde un listado de choferes
históricos aparecía como operación actual.

## 6. Principios de arquitectura no negociables

1. **La identidad de una persona es el CI, no el nombre.** Toda entidad humana cuelga de
   `personas.ci` (normalizado y **obligatorio**). Nunca se deduplica por nombre.
2. **CI es identificador de negocio, UUID es primary key.** La CI nunca es la PK de PostgreSQL.
3. **Separar persona de participación.** Una persona puede ser chofer en 2026 y supervisor en
   2028. La tabla `choferes` es una *participación en una elección*, no una persona.
4. **Todo dato operativo está particionado por `organizacion_id` y `eleccion_id`.** Sin
   excepción. Es lo que permite multi-operativo y antecedentes históricos.
5. **Nada se borra.** Borrado lógico (`deleted_at`) + bitácora de auditoría inmutable.
   Una aparición duplicada en una planilla no se elimina: se archiva en `apariciones_origen`
   y queda visible en la ficha.
6. **RLS siempre activo**, incluso en tablas de catálogo, y **siempre empezando por
   `organizacion_id`**. Una tabla sin política es una tabla sin acceso, no una tabla abierta.
7. **El importador nunca escribe directo en producción.** Todo import pasa por `staging` →
   validación → resolución de conflictos → commit.
8. **El estado de caja se registra con fecha y responsable, no con un `SI` suelto.** Firmado,
   anticipo pagado y pago finalizado son marcas con autor y timestamp; el monto es opcional.
9. **Los datos del padrón son de solo lectura**, importados como snapshot versionado, nunca
   editables desde la UI, y su consulta siempre queda registrada.

## 7. Stack obligatorio

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + **shadcn/ui** | Server Components por defecto |
| Formularios | **React Hook Form + Zod** | Validación en el borde; no reemplaza CHECK de PostgreSQL |
| Tablas | **TanStack Table** | Paginación server-side obligatoria |
| Backend | Supabase (PostgreSQL 15+) | Lógica de negocio en RPC/SQL cuando toca integridad |
| Auth | Supabase Auth | Email+password con MFA obligatorio para roles de escritura |
| Hosting | Vercel | Preview deploys con base de datos separada |
| DNS/WAF | Cloudflare | Rate limiting y geo-restricción en rutas administrativas |
| Integraciones | Google Sheets API, Traccar API | Siempre vía job server-side, nunca desde el navegador |

## 8. Identidad de persona y búsqueda

### CI normalizada

- `4.361.034` = `4361034` — misma CI
- Solo dígitos, sin ceros a la izquierda
- **Solo la CI tiene normalización automática.** No aplicar normalización agresiva de nombres.

### Búsqueda por CI

- Acepta con y sin puntos
- Autocompletado server-side con debounce (300ms)
- Máximo 15 resultados en autocompletado
- Con cancelación (AbortController)
- Respetar RLS
- Backend/server-side obligatorio

### Búsqueda por nombre

- **Coincidencia exacta por defecto**
- No usar `ILIKE '%texto%'` como comportamiento predeterminado
- `José` ≠ `Jose`, `GAMARRA` ≠ `Gamarra` — preservar acentos y mayúsculas
- Búsqueda sobre `nombres` y `apellidos` por separado
- La búsqueda parcial existe como función **explícita y separada**

### Performance de búsqueda

- `/choferes` abre con estado vacío: "Buscar chofer"
- La consulta se ejecuta **únicamente cuando hay algo que buscar**
- Debounce, paginación, server-side filtering, índices
- Cancelación de búsquedas obsoletas
- No pre-cargar cientos/miles de registros

## 9. Convenciones de código

- **Idioma:** identificadores de BD y dominio en **español** (`choferes`, `barrios`,
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

## 10. Reglas de seguridad para agentes

- Nunca escribir claves reales en el repositorio. Solo `.env.example` con nombres.
- La `service_role` key **jamás** se usa en código que corra en el navegador ni en un Client
  Component. Solo en Route Handlers/Server Actions y jobs.
- Nunca subir datos reales (CI, teléfonos, padrón) a fixtures, tests, issues o prompts.
  Usar los generadores de datos sintéticos de `scripts/validation/`.
- Nunca ejecutar `DROP`, `TRUNCATE`, `DELETE` sin `WHERE`, ni `supabase db reset` contra un
  proyecto que no sea local.
- Cualquier migración que borre o renombre columnas requiere aprobación explícita.

### Prohibiciones absolutas para agentes

Ningún agente puede:

- Cambiar arquitectura fundamental sin documentarlo
- Modificar RLS sin revisión del agente principal
- Ejecutar migraciones de producción
- Borrar datos
- Eliminar auditoría
- Modificar datos reales
- Exponer secretos
- Hacer `DROP` o `DELETE` sobre datos existentes
- Conectar Traccar a producción
- Importar datos reales sin pipeline de staging

## 11. Identidad visual

| Token | Valor | Uso |
|---|---|---|
| Rojo Colorado | `#C00000` | Acentos estratégicos, no fondo dominante |
| Blanco | `#FFFFFF` | Fondo principal |
| Gris oscuro | `#333333` | Texto principal |

**Reglas de diseño:**

- Interfaz profesional, moderna, institucional, rápida, limpia, clara, minimalista
- No hacer toda la interfaz roja — usar rojo **estratégicamente**
- Evitar fondos excesivamente oscuros, exceso de rojo, animaciones innecesarias
- Evitar sombras excesivas, tarjetas innecesarias, tipografías difíciles de leer

## 12. Fases de desarrollo

Cada fase termina con un informe y **aprobación humana**:

| Fase | Contenido |
|---|---|
| 0 | Arquitectura y documentación |
| 1 | Base de datos + Auth + Roles + RLS |
| 2 | Personas + Padrón + Búsqueda |
| 3 | Choferes + Asignaciones + Cupos |
| 4 | Antecedentes + Blacklist + Excepciones |
| 5 | Órdenes + Planillas |
| 6 | Caja |
| 7 | Dashboard + Reportes + Exportaciones |
| 8 | Google Sheets |
| 9 | Traccar |
| 10 | Auditoría + Seguridad + Performance + Producción |

**Después de cada fase:**

1. lint ✅
2. typecheck ✅
3. tests ✅
4. build ✅
5. revisión de seguridad
6. revisión UX
7. documentación actualizada

No acumular errores.

## 13. Flujo de trabajo

1. Rama por tarea: `feat/`, `fix/`, `docs/`, `chore/`.
2. Commits en español, imperativo, referenciando el documento o decisión afectada.
3. Todo PR que toque el esquema incluye: migración, migración de rollback, test de RLS y
   actualización de `docs/database.md`.
4. `main` siempre desplegable. Producción solo desde tags.
5. No hacer commits gigantescos. Usar mensajes claros.
6. No incluir `.env`, secrets, passwords, datos reales, Excel reales.

## 14. Qué hacer ante información faltante

**No inventar.** Si un dato de negocio no está definido (montos, cupos, criterios), el agente:

1. Lo registra en `docs/decisiones-pendientes.md` con un ID `D-xx`.
2. Deja el campo como nulo/configurable, no con un valor "razonable" hardcodeado.
3. Lo menciona explícitamente en el resumen.

## 15. Definición de "terminado"

Una funcionalidad está terminada cuando: tiene test, tiene política RLS probada con un
usuario de cada rol, escribe en la bitácora de auditoría, aparece en la documentación y
alguien distinto del autor la ejecutó en preview.

## 16. Mapa de documentos

| Documento | Contenido |
|---|---|
| `SPEC.md` | Qué hace el sistema, alcance y fuera de alcance |
| `ROADMAP.md` | Fases, entregables y criterios de salida |
| `SECURITY.md` | Riesgos, controles, cumplimiento |
| `docs/architecture.md` | Arquitectura técnica y decisiones |
| `docs/database.md` | Modelo de datos, relaciones, RLS |
| `docs/data-dictionary.md` | Diccionario de datos completo (referencia de implementación) |
| `docs/permissions.md` | Roles, permisos y matriz de acceso |
| `docs/workflows.md` | Flujos operativos (consulta, alta, lista negra, cupos, caja, import/export) |
| `docs/security.md` | Seguridad detallada por capa |
| `docs/traccar.md` | Integración GPS |
| `docs/testing.md` | Estrategia de testing y matriz de casos |
| `docs/performance.md` | Estrategia de performance y objetivos |
| `docs/audit-datos.md` | Auditoría de las planillas de origen |
| `docs/audit-padron.md` | Auditoría del padrón de Villa Hayes (35.192 registros) |
| `docs/busqueda-y-historico.md` | Búsqueda, histórico y operación actual |
| `docs/decisiones-pendientes.md` | Decisiones que bloquean implementación |
| `docs/despliegue.md` | Aplicar el esquema y cargar los datos en Supabase |

## 17. Agentes especializados

Cuando se utilicen agentes especializados, crear:

- `database-architect` — PostgreSQL/Supabase
- `security-auditor` — Seguridad y RLS
- `business-rules-auditor` — Reglas de negocio
- `ux-ui-designer` — Diseño e interfaz (NO modifica backend)
- `frontend-engineer` — Next.js + shadcn/ui
- `backend-engineer` — Supabase + RPC
- `data-import-engineer` — Importación/exportación
- `qa-engineer` — Testing
- `performance-engineer` — Performance
- `traccar-engineer` — GPS

Los agentes NO deben modificar simultáneamente la misma parte del proyecto sin coordinación.
Los cambios críticos requieren revisión del agente principal.
