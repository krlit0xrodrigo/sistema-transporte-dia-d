# Estrategia de Performance

Versión 2.0 — 2026-09-12

---

## 1. Objetivos medibles

| Ruta | Métrica | Target | Notas |
|---|---|---|---|
| `/consulta` (búsqueda CI) | Time to first result | **< 300ms** | Incluye debounce, red, query, render |
| `/choferes` (autocompletado) | Response time | **< 200ms** | Server-side, 15 resultados max |
| `/dashboard` | LCP (Largest Contentful Paint) | **< 1s** | SSR, datos agregados |
| `/cupos` | Refresh semáforo | **< 500ms** | Consulta de sumas |
| `/reportes` | Generación | **< 2s** | Server-side rendering |
| `/exportar` (XLSX) | Generación 5000 filas | **< 5s** | ExcelJS streaming |
| Alta de chofer | Transacción completa | **< 2s** | `fn_alta_chofer` + render |
| Login | Redirect post-auth | **< 1s** | Middleware + Supabase Auth |

## 2. Antipatrones a detectar y evitar

### 2.1 Queries

| Antipatrón | Detección | Corrección |
|---|---|---|
| **N+1 queries** | Cada fila dispara una consulta | Joins, `select` con relaciones |
| **Queries duplicadas** | Misma query ejecutada múltiples veces | Cache en request scope, consolidar |
| **Waterfalls** | Queries secuenciales independientes | `Promise.all` para queries paralelas |
| **Sin índice** | `EXPLAIN ANALYZE` muestra seq scan | Índice en columnas de WHERE/JOIN/RLS |
| **ILIKE '%texto%'** | Full scan en cada búsqueda | `text_pattern_ops` para prefijo, `pg_trgm` para parcial |
| **SELECT *** | Trae columnas innecesarias | Select explícito de columnas necesarias |

### 2.2 Frontend

| Antipatrón | Detección | Corrección |
|---|---|---|
| **Cargar todo al abrir** | `/choferes` trae 1000 filas | Estado vacío, buscar bajo demanda |
| **Renders innecesarios** | React DevTools Profiler | `memo`, `useMemo`, `useCallback` donde mida |
| **Bundle grande** | `next/bundle-analyzer` | Dynamic imports, tree shaking |
| **Fuentes pesadas** | Network tab | `next/font` con subset |
| **Sin cancelación** | Búsquedas obsoletas pisan resultados | `AbortController` en cada búsqueda |
| **Sin debounce** | 7 queries por 7 teclas | 300ms debounce |
| **Hydration mismatch** | SSR ≠ CSR | Server Components por defecto |
| **Client Component innecesario** | Componente sin interactividad marcado `'use client'` | Mover a Server Component |

### 2.3 Red

| Antipatrón | Detección | Corrección |
|---|---|---|
| **Llamadas repetidas** | Network tab | Consolidar en una sola llamada |
| **Sin paginación** | Response de 100KB+ | Paginación server-side (25/50/100) |
| **Imágenes sin optimizar** | Lighthouse | `next/image` con formatos modernos |
| **Sin compresión** | Headers | Vercel comprime por defecto |

## 3. Estrategia por ruta

### `/consulta` — La ruta más importante

```
Usuario escribe CI
    │ debounce 300ms
    ▼
AbortController cancela búsqueda anterior
    │
    ▼
Server Action / Route Handler
    │ query con índice ix_personas_ci_prefijo (text_pattern_ops)
    │ LIMIT 15
    │ RLS filtra por scope del usuario
    ▼
Resultados en < 200ms
    │
    ▼
Al seleccionar: carga ficha con queries paralelas
    │ Promise.all([
    │   persona + asignación,     ← join
    │   padrón (RPC),            ← registra acceso
    │   antecedentes,            ← por persona_id
    │   lista negra,             ← si tiene permiso
    │   apariciones_origen       ← por persona_id + eleccion_id
    │ ])
    ▼
Ficha completa en < 500ms
```

### `/choferes` — Estado vacío obligatorio

```
Abrir /choferes
    │
    ▼
Estado vacío: "Buscar chofer" + campo de búsqueda
    │ NO cargar ningún dato
    │
    ▼
Al buscar: debounce → query paginada server-side
    │ TanStack Table con sorting/filtering server-side
    │ 25 filas por página
    ▼
Resultados paginados
```

### `/dashboard` — SSR con datos agregados

```
Abrir /dashboard
    │
    ▼
Server Component (SSR)
    │ Queries paralelas de agregación:
    │   COUNT(choferes WHERE eleccion_id = actual)
    │   SUM(cupo_movimientos) por ámbito
    │   COUNT(lista_negra WHERE vigente)
    │   COUNT(excepciones WHERE pendiente)
    │ Una sola roundtrip con RPC o vista materializada
    ▼
Dashboard en < 1s
```

### `/reportes` y `/exportar`

```
Generar reporte
    │
    ▼
Server Action (no en el browser)
    │ ExcelJS con streaming (no construir todo en memoria)
    │ Registrar en exportaciones ANTES de entregar
    │ Paginación interna para queries grandes
    ▼
Archivo en < 5s para 5000 filas
```

## 4. Índices previstos

```
-- Búsqueda por CI (prefijo para autocompletado)
personas(organizacion_id, ci) -- ya existe
CREATE INDEX ix_personas_ci_prefijo ON personas (ci text_pattern_ops);

-- Búsqueda por nombre (exacta)
personas(apellidos, organizacion_id)
personas(nombres, organizacion_id)

-- Búsqueda parcial por nombre (pg_trgm, solo cuando se active explícitamente)
personas(nombre_completo gin_trgm_ops)

-- RLS y consultas frecuentes
choferes(organizacion_id, eleccion_id, estado)
choferes(persona_id)
asignaciones(chofer_id) -- vigente
asignaciones(candidato_id, eleccion_id)
asignaciones(barrio_id)
asignaciones(supervisor_id)
apariciones_origen(persona_id, eleccion_id)
padron_electoral(snapshot_id, ci)
padron_electoral(ci)
cupo_movimientos(cupo_id)
folios(serie_id, estado)
traccar_eventos(dispositivo_id, ocurrido_en DESC)
actividad_diaria(chofer_id, fecha)
audit_log(organizacion_id, tabla, registro_id)
audit_log(ocurrido_en DESC)
usuario_scopes(usuario_id, organizacion_id, eleccion_id)
```

## 5. Medición

### Herramientas

| Herramienta | Qué mide | Cuándo |
|---|---|---|
| Lighthouse | Core Web Vitals, accesibilidad | Cada PR |
| `next/bundle-analyzer` | Tamaño de bundles | Semanal |
| `EXPLAIN ANALYZE` en Supabase | Costo de queries | Al crear/modificar queries |
| k6 | Latencia bajo carga (50 usuarios) | Pre-release |
| React DevTools Profiler | Renders innecesarios | Durante desarrollo |
| Vercel Analytics | Performance real en producción | Continuo |
| Network tab | Waterfalls, tamaño de responses | Durante desarrollo |

### Umbrales de alerta

| Métrica | Umbral |
|---|---|
| Búsqueda CI p95 | > 500ms → investigar |
| Dashboard LCP | > 2s → investigar |
| Bundle JS principal | > 200KB gzipped → investigar |
| Query plan | Seq scan en tabla > 1000 filas → agregar índice |
| RLS evaluation | > 50ms por fila → revisar funciones de scope |

## 6. Decisiones de rendering

| Ruta/Componente | Estrategia | Motivo |
|---|---|---|
| Layout, sidebar, navegación | SSR (Server Component) | Estático por sesión |
| Dashboard widgets | SSR | Datos agregados, sin interactividad |
| Búsqueda/autocompletado | CSR (Client Component) | Interactividad continua |
| Tablas (TanStack) | CSR con datos server-side | Sorting/filtering interactivo |
| Formularios (React Hook Form) | CSR | Estado local del form |
| Ficha de persona | SSR + CSR selectivo | Datos en SSR, acciones en CSR |
| Planilla de impresión | SSR | HTML estático para `@media print` |
| Reportes/exportación | Server Action | No exponer datos al browser |

## 7. Checklist pre-deploy

- [ ] `next build` sin warnings de bundle
- [ ] Bundle principal < 200KB gzipped
- [ ] Lighthouse Performance > 90 en rutas principales
- [ ] No hay `LIKE '%...'` en queries de búsqueda
- [ ] Todas las queries de RLS usan índice
- [ ] No hay N+1 en listados paginados
- [ ] Debounce de 300ms en todos los campos de búsqueda
- [ ] AbortController en todas las búsquedas
- [ ] Estado vacío en `/choferes` (no pre-carga)
- [ ] Paginación server-side en todas las tablas
- [ ] Fuentes con `next/font` y subset
- [ ] Imágenes con `next/image`
