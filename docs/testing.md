# Estrategia de Testing

Versión 2.0 — 2026-09-12

---

## 1. Niveles de testing

| Nivel | Herramienta | Qué cubre | Criterio |
|---|---|---|---|
| Unitario | Vitest | Normalización CI/teléfono, Zod schemas, format, utils | ≥ 80 % en `lib/` y `services/` |
| Base de datos | pgTAP | RLS × rol × tabla × operación, cupos, folios, triggers | 100 % tablas con política probada |
| Integración | Vitest + Supabase local | RPCs completas, importador, flujos | Todos los flujos de `workflows.md` |
| E2E | Playwright | Alta, consulta, excepción, pago, exportación | 1 sesión por rol |
| Carga | k6 | 50 usuarios concurrentes, 10K choferes | p95 < 1s, 0 sobre-cupo |
| Seguridad | CI pipeline | Secretos, npm audit, tabla sin RLS, cabeceras | Bloquea merge |
| Datos | Scripts validación | Duplicados, nulos, folios huérfanos | Ejecución diaria operativo |

## 2. Datos de prueba

Siempre **sintéticos**. Generador en `scripts/validation/` que produce:
- CI válidos ficticios
- Nombres y teléfonos falsos
- Misma distribución de suciedad que datos reales (duplicados, nulos, formatos mixtos)
- **Nunca datos reales en tests, fixtures o issues**

## 3. Matriz de casos de prueba

### 3.1 CI y normalización

| Caso | Entrada | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|---|
| CI con puntos | `4.361.034` | Normaliza a `4361034` | Unit | Alta |
| CI sin puntos | `4361034` | Acepta tal cual | Unit | Alta |
| CI con .0 de Excel | `4349952.0` | Normaliza a `4349952` | Unit | Alta |
| CI con ceros | `0123456` | Normaliza a `123456` | Unit | Alta |
| CI vacío | `` | Rechazo (RN-10) | Unit | Crítica |
| CI no numérico | `ABC123` | Rechazo | Unit | Alta |
| CI < 5 dígitos | `1234` | Rechazo | Unit | Media |

### 3.2 Padrón

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| CI existe en padrón | `verificado_en_padron = true`, local/mesa/orden derivados | Integration | Alta |
| CI no existe en padrón | `estado_identidad = 'fuera_de_padron'`, alta permitida (RN-17) | Integration | Alta |
| CI existe con nombre diferente | `estado_identidad = 'discrepancia_nombre'`, conflicto | Integration | Alta |
| Consulta de padrón registra acceso | Fila en `accesos_sensibles` | Integration | Alta |
| Persona fuera de padrón puede cobrar | Pago final exitoso | Integration | Alta |

### 3.3 Histórico vs operación actual

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Persona con antecedentes NO aparece en choferes actuales | `/choferes` vacío sin altas actuales | Integration | Crítica |
| Persona puede tener antecedente sin ser chofer actual | Ficha muestra antecedentes, operación actual vacía | Integration | Crítica |
| Persona puede ser chofer actual y tener antecedentes | Ambas secciones visibles por separado | Integration | Crítica |
| Alta de persona histórica crea chofer actual | Nuevo registro en `choferes` con `eleccion_id` actual | Integration | Alta |

### 3.4 Duplicados

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Dos usuarios cargando la misma CI | Solo uno éxito; el segundo bloqueado | Concurrency | Crítica |
| CI ya existe como chofer activo | Bloqueo duro, mostrar ficha existente | Integration | Crítica |
| CI repetido en importación | Conflicto en staging, resolución humana | Integration | Alta |
| CI asociada a nombre incompatible | Conflicto, no resolver automáticamente | Integration | Alta |

### 3.5 Blacklist

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Alta con CI en lista negra (bloqueo_total) | Bloqueo, requiere excepción | Integration | Crítica |
| Alta con CI en lista negra (advertencia) | Permitida con confirmación | Integration | Alta |
| Alta con CI en lista negra + excepción aprobada | Alta exitosa | Integration | Crítica |
| Excepción con aprobador = solicitante | Rechazo (CHECK constraint) | DB | Crítica |
| Revocar lista negra no borra registro | Registro original intacto | DB | Alta |

### 3.6 Cupos y concurrencia

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Alta consume cupo de candidato Y barrio Y supervisor | 3 movimientos registrados | Integration | Crítica |
| Cupo agotado bloquea alta | Error `CUPO_AGOTADO` | Integration | Crítica |
| **Dos usuarios consumiendo último cupo** | Solo uno éxito (FOR UPDATE) | **Concurrency** | **Crítica** |
| Baja libera cupo (movimiento -1) | Cupo disponible + 1 | Integration | Alta |
| Alta sobre cupo con excepción | Alta exitosa con `excepcion_id` | Integration | Alta |
| Cupo sin definir no restringe | Alta exitosa | Integration | Media |

### 3.7 Asignaciones

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Un chofer, un candidato por elección | Índice único parcial | DB | Crítica |
| Reasignar cierra la vigente y abre otra | `vigente_hasta` set, nueva fila | Integration | Alta |
| Dos asignaciones vigentes simultáneas | Imposible (índice único) | DB | Crítica |

### 3.8 Caja

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Vale sin contrato firmado | Rechazo (RN-06) | Integration | Crítica |
| Anticipo sin contrato firmado | Rechazo | Integration | Crítica |
| **Doble pago final** | **Imposible** (índice único) | **DB** | **Crítica** |
| Pago sin actividad sin excepción | Rechazo (RN-08) | Integration | Alta |
| Autorización ≠ ejecución | Distinto rol requerido | Integration | Alta |
| Folio asignado no se reutiliza | Folio en estado `usado` | DB | Crítica |
| Folio anulado no vuelve a disponible | Estado irreversible | DB | Alta |
| Dos cajeros, mismo folio | `SKIP LOCKED` asigna folios diferentes | Concurrency | Alta |

### 3.9 Roles y permisos (RLS)

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| **Usuario consulta intentando modificar** | **RLS rechaza** — no solo UI | **DB** | **Crítica** |
| **Supervisor accediendo fuera de su scope** | **0 filas devueltas** | **DB** | **Crítica** |
| Candidato viendo choferes de otro candidato | 0 filas | DB | Crítica |
| Admin ve todo en su organización | Todas las filas | DB | Alta |
| **Organización A viendo datos de B** | **0 filas** | **DB** | **Crítica** |
| Nadie puede UPDATE/DELETE `audit_log` | Error de permiso | DB | Crítica |
| **Usuario intentando exportar PII sin permiso** | **Rechazo en RLS** | **DB** | **Crítica** |

### 3.10 Importación/Exportación

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| Archivo ya importado (mismo hash) | Aviso de reimportación | Integration | Alta |
| Fila sin CI | Rechazo, informe | Integration | Alta |
| Exportación registra en `exportaciones` | Fila creada antes de entregar archivo | Integration | Alta |
| Exportación sin permiso `datos.exportar` | Insert rechazado por RLS | DB | Alta |
| Rate limit superado | Rechazo | Integration | Media |

### 3.11 **Intento de modificar auditoría**

| Caso | Resultado esperado | Tipo | Prioridad |
|---|---|---|---|
| UPDATE sobre `audit_log` | Error para todos los roles | DB | Crítica |
| DELETE sobre `audit_log` | Error para todos los roles | DB | Crítica |
| INSERT directo en `audit_log` | Solo trigger, no roles de app | DB | Alta |

## 4. Los 10 casos críticos del master prompt

| # | Caso | Tipo | Cubierto en |
|---|---|---|---|
| 1 | Dos usuarios cargando la misma CI | Concurrency | §3.4 |
| 2 | Dos usuarios consumiendo último cupo | Concurrency | §3.6 |
| 3 | Blacklist sin excepción | Integration | §3.5 |
| 4 | Blacklist con excepción | Integration | §3.5 |
| 5 | Histórico (persona sin ser chofer actual) | Integration | §3.3 |
| 6 | Persona fuera de padrón | Integration | §3.2 |
| 7 | Usuario consulta intentando modificar | DB/RLS | §3.9 |
| 8 | Supervisor accediendo fuera de scope | DB/RLS | §3.9 |
| 9 | Usuario exportando PII sin permiso | DB/RLS | §3.9 |
| 10 | Intento de modificar auditoría | DB | §3.11 |

## 5. Testing responsive

| Resolución | Dispositivo | Prioridad |
|---|---|---|
| 1920×1080 | Desktop HD | Alta |
| 1440×900 | Laptop | Alta |
| 1366×768 | Laptop común | Alta |
| 1024 | Tablet landscape | Media |
| 768 | Tablet portrait | Media |
| 390 | Mobile (iPhone 12+) | Alta |
| 375 | Mobile (iPhone SE) | Alta |

## 6. Testing de performance

| Ruta | Métrica | Target |
|---|---|---|
| Búsqueda CI | Time to first result | < 300ms |
| Autocompletado | Response time | < 200ms |
| Listado paginado | Render completo | < 1s con 10K registros |
| Dashboard | LCP | < 1s |
| Exportación XLSX | Generación | < 5s para 5000 filas |
| Alta de chofer | Transacción completa | < 2s |

## 7. Ejecución

- **Pre-commit:** lint, typecheck
- **CI (cada PR):** unit + DB tests + build + security scan
- **Nightly:** integration + datos
- **Pre-release:** E2E + carga
- **Operativo:** scripts de validación diarios
