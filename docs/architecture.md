# Arquitectura v2

Versión 2.0 — 2026-09-12
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

## 2. Decisiones de arquitectura (ADR)

### ADR-01 — La seguridad vive en la base de datos, no en el frontend
**Decisión:** RLS en PostgreSQL como única fuente de autorización. El frontend oculta, la base
prohíbe.
**Motivo:** PII masiva y dinero, con usuarios de confianza variable. Autorización solo en la app
se evade con llamada directa a la API.

### ADR-02 — `personas` separada de `choferes`
**Decisión:** tabla de identidad (`personas`, CI único) + tabla de participación
(`choferes`, una fila por persona y elección).
**Motivo:** resuelve doble pago, habilita antecedentes históricos sin duplicar identidad.

### ADR-03 — Todo particionado por `eleccion_id`
**Decisión:** `elecciones` es la raíz del modelo operativo.
**Motivo:** "antecedentes históricos" es requisito explícito; sin esta dimensión no existen.

### ADR-04 — Lógica de integridad crítica en PostgreSQL
**Decisión:** cupos, folios y transiciones de estado de pago en funciones `plpgsql` con bloqueo
transaccional.
**Motivo:** el Día D hay concurrencia real.

### ADR-05 — Importación con staging obligatorio
**Decisión:** ningún archivo escribe directo en tablas de dominio.
**Motivo:** la auditoría muestra 64 CI duplicados y 20 filas sin CI.

### ADR-06 — Google Sheets es sólo importación inicial
**Decisión:** las hojas entran una vez. No hay sincronización continua.
**Motivo:** dos fuentes editables producen divergencia.

### ADR-07 — Traccar por job server-side, vínculo por `device_id`
**Decisión:** job periódico trae eventos; vínculo con chofer es FK explícita.
**Motivo:** el reporte cruzó por nombre con 52 nombres repetidos.

### ADR-08 — Borrado lógico + bitácora inmutable
**Decisión:** `deleted_at` + `audit_log` sin UPDATE/DELETE.
**Motivo:** requisito de auditoría y reconstrucción.

### ADR-09 — Next.js App Router con Server Components por defecto
**Decisión:** lectura en Server Components con JWT propagado. Client Components solo para
interactividad.

### ADR-10 — Multi-organización desde el día uno
**Decisión:** `organizaciones` como raíz, `organizacion_id` en las 45 tablas.
**Excepción:** padrón es transversal (dato público).

### ADR-11 — El padrón reemplaza al dato declarado
**Decisión:** campos que el padrón resuelve se derivan de él, no se editan a mano.
**Motivo:** 89 errores comprobables en campo manual "Vota en Villa Hayes".

### ADR-12 — La duplicación se archiva, no se borra
**Decisión:** `apariciones_origen` guarda cada aparición de un CI, incluso las descartadas.

### ADR-13 — Frontend con shadcn/ui + React Hook Form + TanStack Table *(nuevo v2)*
**Decisión:** reconstruir el frontend completo con el stack profesional.
**Motivo:** la v1 fue construida sin estos componentes por presión de calendario.
**Consecuencia:** todo componente de UI se reconstruye, pero la lógica de base de datos se preserva.

### ADR-14 — Dos puertas: Consulta vs Operación *(nuevo v2)*
**Decisión:** el sistema tiene dos flujos diferenciados como principio de navegación:
- **Puerta 1 — Consulta:** ¿Quién es esta persona? (CI → ficha → padrón → antecedentes)
- **Puerta 2 — Operación:** ¿Incorporar como chofer? (CI → validaciones → alta → asignación)

**Motivo:** la v1 mezclaba choferes históricos con operación actual, produciendo un listado
que aparecía lleno de gente que nadie había dado de alta.

### ADR-15 — Desarrollo por fases con gate de aprobación humana *(nuevo v2)*
**Decisión:** cada fase termina con informe y aprobación. Ninguna avanza automáticamente.
**Motivo:** en la v1, una importación tomó la elección equivocada. Ese error se propaga si
no hay revisión entre fases.

### ADR-16 — Entorno de desarrollo aislado de producción *(nuevo v2)*
**Decisión:** el flujo es: Desarrollo local → Test DB → QA → Revisión humana → Producción.
**Motivo:** proteger datos reales de errores de desarrollo.

## 3. Estructura del repositorio

```
sistema-transporte-dia-d/
├── CLAUDE.md · SPEC.md · ROADMAP.md · README.md · SECURITY.md
├── docs/
│   ├── architecture.md           database.md
│   ├── data-dictionary.md        permissions.md
│   ├── workflows.md              security.md
│   ├── testing.md                performance.md
│   ├── traccar.md                busqueda-y-historico.md
│   ├── audit-datos.md            audit-padron.md
│   ├── despliegue.md             decisiones-pendientes.md
├── supabase/
│   ├── migrations/               # numeradas, idempotentes, con rollback
│   ├── seed.sql                  # catálogos + datos sintéticos
│   ├── functions/                # Edge Functions (jobs, webhooks)
│   └── tests/                    # pgTAP: RLS, cupos, folios
├── src/
│   ├── app/
│   │   ├── (auth)/               # login, recuperación, MFA
│   │   ├── (app)/                # panel autenticado
│   │   │   ├── consulta/         # ← PUERTA 1: ¿Quién es esta persona?
│   │   │   ├── choferes/         # ← PUERTA 2: Operación actual
│   │   │   ├── alta/             # Alta de chofer
│   │   │   ├── asignaciones/     # Asignaciones
│   │   │   ├── ordenes/          # Órdenes de transporte
│   │   │   ├── cupos/            # Control de cupos
│   │   │   ├── lista-negra/      # Lista negra
│   │   │   ├── antecedentes/     # Antecedentes históricos
│   │   │   ├── excepciones/      # Excepciones
│   │   │   ├── contratos/        # Contratos
│   │   │   ├── caja/             # Caja (combustible, anticipos, pagos)
│   │   │   ├── gps/              # GPS / Traccar
│   │   │   ├── reportes/         # Reportes
│   │   │   ├── importar/         # Importación
│   │   │   ├── exportar/         # Exportación
│   │   │   ├── usuarios/         # ABM de usuarios
│   │   │   ├── auditoria/        # Panel de auditoría
│   │   │   ├── configuracion/    # Configuración del sistema
│   │   │   └── dashboard/        # Dashboard
│   │   ├── (imprimir)/           # Planillas de impresión
│   │   └── api/                  # Route Handlers
│   ├── components/
│   │   ├── ui/                   # shadcn/ui (solo shadcn)
│   │   ├── choferes/             # Componentes de dominio
│   │   ├── caja/
│   │   ├── reportes/
│   │   ├── importacion/
│   │   └── shared/               # Componentes compartidos
│   ├── lib/
│   │   ├── supabase/             # Clientes server/browser
│   │   ├── auth/                 # Helpers de autenticación
│   │   ├── validation/           # Zod schemas
│   │   ├── format/               # Formateo (CI, teléfono, fechas)
│   │   └── permissions/          # Helpers de permisos
│   ├── services/
│   │   ├── choferes/
│   │   ├── cupos/
│   │   ├── caja/
│   │   ├── traccar/
│   │   ├── sheets/
│   │   └── padron/
│   ├── hooks/                    # React hooks personalizados
│   └── types/                    # types/database.ts generado
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── scripts/
    ├── import/
    ├── export/
    └── validation/
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
| Google Sheets | entrada | Service Account + Sheets API, en Route Handler | Solo importación inicial |
| Traccar | entrada | REST API con job programado | Cada 5–15 min (futuro) |
| Supabase Storage | ambos | Bucket privado + URL firmada | On-demand |

## 6. Observabilidad

- Logs estructurados sin PII (se loguea `chofer_id`, nunca CI)
- Métricas: latencia de alta, errores de importación, cupos al límite
- Alertas Día D: job Traccar caído > 20 min, error rate > 2 %, folios agotados
- Panel de salud para administrador

## 7. Plan de contingencia del Día D

1. **Modo solo lectura:** bandera global que corta escrituras
2. **Exportación previa:** paquete PDF/Excel de planillas por barrio
3. **Conciliación posterior:** papel se vuelca vía importador con origen `contingencia_papel`
4. **Backups:** snapshot horario durante 48h del operativo
