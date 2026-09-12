# Arquitectura

Versión 0.2 — decisiones D-01 a D-19 aplicadas · 2026-09-12
Repositorio: `github.com/krlit0xrodrigo/sistema-transporte-dia-d`

---

## 1. Vista general

```
                          ┌──────────────────────────┐
        Usuarios  ───────▶│   Cloudflare (DNS/WAF)   │
     (navegador/PWA)      │  rate limit · bot mgmt   │
                          └────────────┬─────────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │  Vercel — Next.js App    │
                          │  ┌────────────────────┐  │
                          │  │ RSC / páginas      │  │
                          │  │ Server Actions     │  │
                          │  │ Route Handlers     │  │
                          │  │ Cron (jobs)        │  │
                          │  └────────────────────┘  │
                          └───┬──────────────┬───────┘
              anon key + JWT  │              │  service_role (solo server)
                              │              │
                   ┌──────────▼──────┐   ┌───▼─────────────────────────┐
                   │   Supabase      │   │  Integraciones salientes    │
                   │  PostgreSQL     │   │  · Google Sheets API        │
                   │  + RLS          │   │  · Traccar API              │
                   │  + Auth         │   │  · Almacenamiento de PDFs   │
                   │  + Storage      │   └─────────────────────────────┘
                   │  + Realtime     │
                   └─────────────────┘
```

## 2. Decisiones de arquitectura (ADR resumidos)

### ADR-01 — La seguridad vive en la base de datos, no en el frontend
**Decisión:** RLS en PostgreSQL como única fuente de autorización. El frontend oculta, la base
prohíbe.
**Motivo:** el sistema maneja PII masiva y dinero, con usuarios de confianza variable
(supervisores de campo). Una autorización sólo en la app se evade con una llamada directa a la
API de Supabase usando la `anon key`, que es pública por diseño.
**Consecuencia:** cada tabla necesita política, tests de RLS por rol y funciones de scope
indexadas.

### ADR-02 — `personas` separada de `choferes`
**Decisión:** una tabla de identidad (`personas`, CI único) y una tabla de participación
(`choferes`, una fila por persona y elección).
**Motivo:** resuelve directamente los riesgos R1 (doble pago), R10 (chofer que además es
miembro de mesa) y habilita antecedentes históricos sin duplicar identidad.
**Alternativa descartada:** una sola tabla `choferes` con CI — replica el problema actual en
cuanto haya una segunda elección.

### ADR-03 — Todo particionado por `eleccion_id`
**Decisión:** `elecciones` es la raíz del modelo operativo. Cupos, asignaciones, contratos,
pagos y métricas cuelgan de ella.
**Motivo:** "antecedentes históricos" es requisito explícito; sin esta dimensión no existen.
**Consecuencia:** el contexto de elección activa se resuelve en el servidor y viaja en el JWT
o en una tabla de sesión; nunca lo elige el cliente sin validación.

### ADR-04 — Lógica de integridad crítica en PostgreSQL
**Decisión:** cupos, folios y transiciones de estado de pago se implementan como funciones
`plpgsql` invocadas por RPC, con bloqueo transaccional; no en TypeScript.
**Motivo:** el Día D hay concurrencia real. Un "chequear y luego insertar" en la aplicación
permite pasarse de cupo y reutilizar folios.
**Consecuencia:** menos lógica en el front, más tests de base de datos.

### ADR-05 — Importación con staging obligatorio
**Decisión:** ningún archivo escribe directo en tablas de dominio. Entra a `importaciones` +
`importacion_filas`, se valida, se resuelven conflictos y recién ahí se confirma.
**Motivo:** la auditoría muestra 64 CI duplicados y 20 filas sin CI en el archivo que se iba a
importar. Sin staging, esa suciedad entra a producción.

### ADR-06 — Google Sheets es sólo importación inicial *(D-19)*
**Decisión:** las hojas entran una vez, por el mismo pipeline de staging que un Excel. No hay
sincronización continua ni escritura de vuelta.
**Motivo:** dos fuentes de verdad editables producen exactamente el desastre de la hoja `COPIA`
(551 duplicados exactos y 8 registros divergentes). Cerrar la puerta es más barato que
gestionarla.
**Consecuencia:** la tabla `sincronizaciones_sheets` se elimina del modelo; los reportes salen
del sistema en PDF/XLSX, no de una hoja espejo.

### ADR-07 — Traccar se consume por job server-side, con vínculo por `device_id`
**Decisión:** un job periódico trae eventos y posiciones y los agrega; el vínculo con el chofer
es una FK explícita, nunca un *match* por nombre.
**Motivo:** R3. El reporte actual cruzó por nombre con 52 nombres repetidos.

### ADR-08 — Borrado lógico + bitácora inmutable
**Decisión:** `deleted_at` en todas las tablas de dominio; `audit_log` escrita por triggers,
sin `UPDATE`/`DELETE` permitidos ni para el rol de servicio de la aplicación.
**Motivo:** requisito de auditoría y necesidad de reconstruir qué se sabía en cada momento.

### ADR-09 — Next.js App Router con Server Components por defecto
**Decisión:** lectura de datos en Server Components con el cliente de Supabase del servidor
(propaga el JWT del usuario, respeta RLS). Client Components solo para interactividad.
**Motivo:** menos superficie de datos expuesta al navegador y mejor rendimiento en conexiones
de campo.

### ADR-10 — Multi-organización desde el día uno *(D-12 — revierte la propuesta v0.1)*
**Decisión:** `organizaciones` es la raíz del modelo y `organizacion_id` viaja en toda tabla de
dominio. Toda política RLS empieza por `organizacion_id = auth_organizacion_id()`.
**Motivo:** el responsable del proyecto confirmó que el sistema atenderá más de un operativo.
Agregar la dimensión después implica migrar 45 tablas y reescribir todas las políticas; ahora
cuesta una columna y un índice.
**Consecuencia:** el aislamiento entre organizaciones necesita test propio — uno que intente el
cruce y espere cero filas. Es el test de seguridad más importante del sistema.
**Excepción deliberada:** `padron_electoral` y `padron_participacion` son transversales. El
padrón es un dato público, no propiedad de un operativo, y duplicarlo por organización sería
absurdo (35.192 filas × N) además de inconsistente.

### ADR-11 — El padrón reemplaza al dato declarado *(D-01)*
**Decisión:** los campos que el padrón puede responder (vota en Villa Hayes, local, mesa, orden)
se derivan de él y no se editan a mano.
**Motivo:** el cruce del padrón real contra las planillas encontró **89 errores comprobables**
en el campo declarado "Vota en Villa Hayes" — 84 marcados "NO" que sí están en el padrón. Un
16 % de error en un campo que se puede resolver automáticamente.
**Consecuencia:** el importador consulta el snapshot vigente; un chofer que no aparece queda
marcado `fuera_de_padron` (70 casos, pendiente D-21), no rechazado.

### ADR-12 — La duplicación se archiva, no se borra *(D-03)*
**Decisión:** `apariciones_origen` guarda cada vez que un CI aparece en una planilla, con la
hoja, la fila y el candidato declarado, incluso cuando esa aparición no se aplica.
**Motivo:** los 64 CI duplicados son evidencia de cómo se trabajó, no ruido a limpiar. Borrarlos
haría imposible responder después "¿por qué este chofer figuraba con dos concejales?".
**Consecuencia:** una participación activa (ADR/D-17) y N apariciones consultables en la ficha.

## 3. Estructura del repositorio

```
sistema-transporte-dia-d/
├── CLAUDE.md · SPEC.md · ROADMAP.md · README.md · SECURITY.md
├── docs/
│   ├── audit-datos.md        architecture.md      database.md
│   ├── permissions.md        workflows.md         security.md
│   ├── traccar.md            decisiones-pendientes.md
├── supabase/
│   ├── migrations/           # numeradas, idempotentes, con rollback
│   ├── seed.sql              # catálogos + datos sintéticos, NUNCA datos reales
│   ├── functions/            # Edge Functions (jobs, webhooks)
│   └── tests/                # pgTAP: RLS, cupos, folios
├── src/
│   ├── app/
│   │   ├── (auth)/           # login, recuperación, MFA
│   │   ├── (app)/            # panel autenticado
│   │   │   ├── choferes/ asignaciones/ cupos/ lista-negra/
│   │   │   ├── excepciones/ contratos/ caja/ gps/ reportes/
│   │   │   ├── importar/ exportar/ auditoria/ admin/
│   │   └── api/              # Route Handlers (webhooks, jobs, export)
│   ├── components/{ui,choferes,caja,reportes,shared}/
│   ├── lib/{supabase,auth,validation,format,permissions}/
│   ├── services/{choferes,cupos,caja,traccar,sheets,padron}/
│   ├── hooks/ · types/       # types/database.ts generado
├── tests/{unit,integration,e2e}/
└── scripts/{import,export,validation}/
```

## 4. Entornos

| Entorno | Base | Datos | Acceso |
|---|---|---|---|
| Local | Supabase CLI | Sintéticos (`seed.sql`) | Desarrollador |
| Preview (por PR) | Proyecto Supabase separado | Sintéticos | Equipo |
| Staging | Proyecto Supabase separado | Copia anonimizada | Equipo + QA |
| Producción | Proyecto dedicado | Reales | Restringido, MFA obligatorio |

**Regla dura:** ningún preview ni staging apunta a la base de producción. Nunca.

## 5. Integraciones

| Integración | Dirección | Mecanismo | Frecuencia |
|---|---|---|---|
| Google Sheets | entrada | Service Account + Sheets API, en Route Handler | **Sólo importación inicial** (D-19) |
| Traccar | entrada | REST API con job programado | Cada 5–15 min (Día D: 5) |
| Supabase Storage | ambos | Bucket privado + URL firmada, para evidencias opcionales | On-demand |

Sin generación de PDF de contrato (D-09) ni geocercas/PostGIS (D-15) en v1.

## 6. Observabilidad

- Logs estructurados en Route Handlers y jobs, **sin PII** (se loguea `chofer_id`, nunca CI ni
  teléfono).
- Métricas mínimas: latencia de alta, errores de importación, desfasaje del job de Traccar,
  cupos al límite.
- Alertas para el Día D: job de Traccar caído > 20 min, tasa de error > 2 %, folios agotados.
- Panel de salud accesible al rol administrador.

## 7. Plan de contingencia del Día D

1. **Modo solo lectura:** bandera global que corta escrituras y mantiene consultas si hay
   incidente.
2. **Exportación previa:** el día anterior se genera el paquete PDF/Excel de todas las
   planillas por barrio, para operar en papel si hace falta.
3. **Conciliación posterior:** el papel se vuelca al sistema mediante el importador con origen
   `contingencia_papel`, quedando marcado como tal.
4. **Backups:** snapshot horario durante las 48 h del operativo.
