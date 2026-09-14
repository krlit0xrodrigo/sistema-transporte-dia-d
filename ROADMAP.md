# ROADMAP v2

**Sistema de Gestión de Transporte — Día D**
Versión 2.0 — 2026-09-12
**Día D: domingo 4 de octubre de 2026** — 22 días de trabajo.

---

## 1. Principio rector

**Cada fase termina con un informe y una revisión humana.**
Ninguna fase avanza automáticamente a la siguiente.
Cada fase termina con: lint ✓, typecheck ✓, tests ✓, build ✓, commit limpio.

## 2. Las 10 fases

### FASE 0 — Arquitectura y documentación ✅

- Auditoría del workspace existente (v1: 45 tablas, 10 migraciones, 604 choferes)
- Análisis de requisitos completo
- 10 documentos de arquitectura creados/actualizados
- Decisión: refactoring evolutivo (preservar BD, reconstruir frontend)

**Salida:** documentación completa, plan aprobado.

---

### FASE 1 — Base de datos + Auth + Roles + RLS

**Objetivo:** fundaciones del backend listas y probadas.

**Tareas:**
- Revisar y consolidar las 10 migraciones existentes
- Verificar que los 76 invariantes siguen en verde
- Instalar dependencias del stack completo (shadcn/ui, React Hook Form, TanStack Table)
- Configurar proyecto Next.js con shadcn/ui
- Supabase Auth con middleware: `getUser()` contra el servidor
- Los 9 roles con sus scopes
- Trigger genérico de `audit_log`
- Design system base (tokens de color, tipografía Inter, layout responsive)
- Cabeceras de seguridad

**Salida:** la base existe con RLS activo, shadcn/ui configurado, cada rol entra y ve lo suyo.

**Gate:** informe de estado + tests RLS + build en verde.

---

### FASE 2 — Personas + Padrón + Búsqueda

**Objetivo:** la consulta funciona — la Puerta 1 del sistema.

**Tareas:**
- Búsqueda por CI con autocompletado server-side (debounce 300ms)
- Búsqueda por nombre (exacta por defecto, parcial explícita)
- Búsqueda por teléfono, chapa, marca, modelo
- Ficha de persona con secciones separadas:
  - Datos personales
  - Padrón (encontrado/no encontrado, local, mesa)
  - Operación actual (vacío si no es chofer actual)
  - Antecedentes históricos
  - Lista negra
  - Excepciones
- Verificación contra padrón con registro de acceso
- Estado vacío en `/choferes`: "Buscar chofer"
- `/consulta` como ruta principal

**Salida:** se puede buscar cualquier persona por CI o nombre y ver su ficha completa con histórico separado.

**Gate:** demo funcional + performance < 300ms en búsqueda CI.

---

### FASE 3 — Choferes + Asignaciones + Cupos

**Objetivo:** la operación funciona — la Puerta 2 del sistema.

**Tareas:**
- Alta de chofer con `fn_alta_chofer` (validaciones en cadena)
- Formulario con React Hook Form + Zod
- Asignación a candidato + barrio + supervisor
- Cupos en cascada (candidato Y barrio Y supervisor)
- Consumo con `FOR UPDATE` (concurrencia segura)
- Tablero de cupos con semáforo (verde/amarillo/rojo)
- Listado de choferes actuales con TanStack Table (paginación server-side)
- Separación visible: operación actual vs histórico

**Salida:** se pueden dar de alta choferes con todas las validaciones, cupos seguros ante concurrencia.

**Gate:** tests de concurrencia (dos usuarios, último cupo) + build.

---

### FASE 4 — Antecedentes + Blacklist + Excepciones

**Objetivo:** control y seguridad operativa.

**Tareas:**
- Lista negra con catálogo de 8 motivos
- Alta en lista negra con severidad y vigencia
- Revocación sin borrado
- Excepciones con flujo: solicitud → aprobación (aprobador ≠ solicitante)
- Vencimiento de excepciones
- Antecedentes históricos por elección (inmutables)
- Visibilidad según rol: supervisor/candidato NO ven lista negra
- Bloqueo en alta cuando hay lista negra vigente

**Salida:** control completo sobre lista negra y excepciones.

**Gate:** tests negativos (blacklist sin excepción, excepción con aprobador = solicitante).

---

### FASE 5 — Órdenes + Planillas

**Objetivo:** trazabilidad operativa y soporte en papel.

**Tareas:**
- Número de orden único por chofer
- Relación CHOFER → ORDEN → PLANILLA → FIRMA
- Planilla de firma imprimible (HTML + `@media print`)
- Agrupación por candidato, supervisor, barrio
- Contenido: número, orden, CI, nombre, apellido, teléfono, supervisor, candidato, barrio, vehículo, estado, firma
- Optimizada para A4 con corte de página por grupo
- Previsualizar + Imprimir + Guardar como PDF
- Ubicación original en planilla (trazabilidad)

**Salida:** la planilla imprimible reemplaza las 21 hojas hechas a mano.

**Gate:** planilla impresa + verificación A4.

---

### FASE 6 — Caja

**Objetivo:** control financiero completo.

**Tareas:**
- Folios: emisión de series, asignación con `FOR UPDATE SKIP LOCKED`
- Contratos: marca de firmado con folio, fecha, responsable
- Vales de combustible: entregado sí/no con folio
- Anticipos: pagado sí/no con folio
- Pagos finales: finalizado sí/no con folio, autorización separada
- Montos opcionales en todos
- Separación autorización (admin) vs ejecución (tesorería)
- Doble pago imposible (índice único)
- Tablero de caja por etapa
- Cadena: sin contrato → sin vale/anticipo

**Salida:** flujo completo de caja funcionando.

**Gate:** 26 invariantes de caja en verde + tests doble pago.

---

### FASE 7 — Dashboard + Reportes + Exportaciones

**Objetivo:** información útil y exportaciones operativas.

**Tareas:**
- Dashboard con datos reales:
  - Choferes actuales (total, activos, suspendidos)
  - Órdenes emitidas
  - Cupos por ámbito con semáforo
  - Cobertura de padrón
  - Lista negra activa
  - Excepciones pendientes
  - Estado de caja
  - GPS (preparado)
  - Incidencias
- 12 tipos de reporte
- Exportación XLSX, CSV, PDF
- Exportación completa `reporte_completo.xlsx` con 12 hojas (solo ADMIN)
- Filtros: CI, nombre, apellido, supervisor, concejal, candidato, barrio, estado, padrón, lista negra, excepción, GPS, combustible, anticipo, pago, contrato, fecha
- Registro de exportación (usuario, filtros, filas, PII)
- Rate limiting (20 exportaciones / 10 min)
- Enmascaramiento de PII según permiso

**Salida:** dashboard operativo + exportaciones funcionando.

**Gate:** XLSX generado correctamente + rate limiting verificado.

---

### FASE 8 — Google Sheets

**Objetivo:** importación/exportación desde/hacia Google Sheets.

**Tareas:**
- Abstracción `SpreadsheetService`
- Import desde Google Sheets (mismo pipeline que Excel)
- Export hacia Google Sheets (ADMIN)
- Service Account, nunca API keys en frontend
- Consulta y ubicación de origen

**Salida:** pipeline de Google Sheets funcional.

**Gate:** importación desde Sheet → staging → confirmación exitosa.

---

### FASE 9 — Traccar/GPS (preparación)

**Objetivo:** schema y UI listos para integración futura.

**Tareas:**
- ABM de dispositivos con vínculo por CI normalizada
- Schema: `traccar_identifier` derivado de CI
- Estados: UNKNOWN, ACTIVE, INACTIVE, OFFLINE
- Pantalla `/gps` con vinculación dispositivo ↔ chofer
- Preparación del job server-side (sin conectar producción)
- Modo degradado documentado

**Salida:** todo preparado para conectar cuando haya acceso a Traccar.

**Gate:** schema + pantalla de vinculación + tests.

---

### FASE 10 — Auditoría + Seguridad + Performance + Producción

**Objetivo:** endurecimiento final.

**Tareas:**
- Panel de auditoría con filtros (usuario, tabla, registro, fecha)
- Administración de usuarios (ABM)
- Configuración del sistema
- Suite pgTAP completa (RLS × rol × tabla × operación)
- Test de aislamiento entre organizaciones
- Tests E2E con Playwright (1 sesión por rol)
- Prueba de carga con k6 (50 usuarios, 10K choferes)
- Revisión de cabeceras, CORS, CSP
- Bundle analysis y optimización
- Simulacro completo del operativo
- Paquete de planillas en papel (plan B)
- Congelamiento y backup

**Salida:** sistema listo para producción.

**Gate:** simulacro exitoso + todos los tests en verde + revisión de seguridad.

---

## 3. Qué se recorta para el calendario

| Se recorta | Por qué se puede | Cuándo vuelve |
|---|---|---|
| Excepciones con flujo de aprobación completo | Marca con aprobador y motivo; circuito completo después | Endurecimiento |
| Job automático de Traccar | Solo vinculación; la ingesta después | Post Día D |
| Libro de caja y arqueo | Montos opcionales; sin montos no hay qué arquear | Cuando se carguen montos |
| Pantallas multi-organización | La columna va desde la primera migración | Post Día D |
| Cobertura de tests profunda | En el sprint: flujos críticos; el resto después | Endurecimiento |

**Lo que no se recorta:** RLS, bitácora, CI obligatorio, un solo chofer por CI,
folios sin repetición, responsable declarado, separación histórico/actual.

## 4. Criterios de calidad por fase

Después de cada fase:

1. `npm run lint` — 0 errores
2. `npm run typecheck` — 0 errores
3. Tests relevantes — todos en verde
4. `npm run build` — éxito
5. Revisión de seguridad — sin regresiones
6. Revisión UX — funcional y usable
7. Documentación actualizada
8. Commit limpio con mensaje descriptivo
9. **Informe + aprobación humana**

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Bugs que en más tiempo se habrían encontrado | Los días de endurecimiento con uso real |
| RLS mal escrita expone datos | Tests negativos por rol × tabla |
| Padrón no llega en UTF-8 | Se importa y se corrige después |
| Duplicados no se resuelven a tiempo | Quedan bloqueados; el sistema opera con los demás |
| Alcance nuevo durante desarrollo | Va a la lista de post-Día D |
| Choferes históricos en operación actual | Separación con doble condición (elección + origen) |
