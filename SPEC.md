# SPEC.md — Especificación funcional v2

**Sistema de Gestión de Transporte — Logística Día D, Villa Hayes**
Versión 2.0 — Reconstrucción profesional · 2026-09-12
**Día D: domingo 4 de octubre de 2026.**

---

## 1. Problema

La logística de transporte del Día D se administró en planillas Excel/Google Sheets
compartidas. La auditoría (`docs/audit-datos.md`) demostró que ese esquema falló:

- 64 CI duplicados con imputación cruzada entre candidatos
- 0 % de registro de contratos y pagos
- Control de actividad GPS cruzado por nombre (52 nombres repetidos)
- 22 registros perdidos entre el maestro y el reporte
- Choferes históricos mezclados con operación actual

La v1 resolvió la importación y la base de datos, pero el frontend fue construido bajo
presión de calendario sin el stack completo.

La v2 reconstruye el sistema con el stack profesional completo, preservando la base de
datos verificada y la documentación probada.

El sistema debe garantizar:

1. **Un chofer = una persona = un CI = un pago.**
2. **Toda plata y todo folio tienen dueño, fecha y responsable.**
3. **Todo cambio queda registrado y es reversible en la lectura.**
4. **Histórico y operación actual son conceptos separados y nunca se mezclan.**

## 2. Objetivos

| # | Objetivo | Métrica de éxito |
|---|---|---|
| O1 | Eliminar duplicados de chofer | 0 CI repetidos activos por elección |
| O2 | Digitalizar contrato, combustible, anticipo y pago final | 100 % de pagos con respaldo y folio |
| O3 | Controlar cupos por candidato/barrio/supervisor | 0 altas sobre cupo sin excepción aprobada |
| O4 | Verificar actividad real por GPS ligada al CI | 100 % de choferes con GPS vinculados por `device_id` |
| O5 | Trazabilidad completa | Toda escritura con autor, timestamp y valor anterior |
| O6 | Reducir el tiempo de alta de un chofer | Alta validada en < 2 minutos |
| O7 | Separar histórico de operación actual | 0 choferes históricos en listado de operación actual |
| O8 | Dos puertas claras: Consulta vs Operación | Flujos diferenciados en la UI |

## 3. Alcance

### 3.1 Dentro de alcance

**Identidad y catálogos**
- Personas (CI único, normalizado), con roles múltiples por elección.
- Catálogo de barrios de Villa Hayes, con locales de votación y alias de importación.
- Catálogo de candidatos/concejales, con lista, orden y datos de preferencial.
- Catálogo de supervisores/referentes, vinculado a persona.
- Catálogo de vehículos (categoría, marca, modelo, chapa), independiente del chofer.

**Padrón electoral** *(archivo recibido — 35.192 registros)*
- Importación de snapshot del padrón de Villa Hayes (solo lectura, versionado).
- Validación automática de "vota en Villa Hayes", local, mesa y orden.
- Enriquecimiento de la ficha con dirección, afiliación partidaria y seccional.
- Historial de participación por elección (`padron_participacion`), en formato largo.
- Consulta de padrón desde la ficha del chofer, registrada en la bitácora de accesos.

**Choferes y asignaciones**
- Alta de chofer con validación de CI, padrón, lista negra, cupo y duplicados.
- Asignación a candidato + barrio + supervisor, con historial de cambios.
- Estado de servicio (contratado / voluntario / otros).
- Ficha unificada con antecedentes de elecciones anteriores.
- **Separación estricta: operación actual vs histórico.**

**Control y excepciones**
- Lista negra a nivel persona, con motivo, evidencia, vigencia y responsable.
- Excepciones formales para habilitar altas bloqueadas o sobre cupo.
- Antecedentes históricos por elección (cumplió/no cumplió, km, incidentes, pagos).

**Cupos**
- Definición de cupo por candidato, por barrio y por supervisor, por elección.
- Consumo en tiempo real y bloqueo al alcanzar el límite.
- Validación segura ante concurrencia (transaction + locking).

**Órdenes de transporte**
- Número de orden único por chofer.
- Relación: CHOFER → NÚMERO DE ORDEN → PLANILLA → FIRMA.
- Localizable posteriormente por número.

**Planilla de firma**
- Generación de planilla imprimible por candidato, supervisor, concejal, barrio.
- Contenido: número, orden, CI, nombre, apellido, teléfono, supervisor, candidato, barrio, vehículo, estado, firma.
- Optimizada para A4, previsualizable, imprimible, guardable como PDF.
- HTML con `@media print`, sin Puppeteer.

**Contratos y caja**
- Contrato: marca de firmado con fecha, responsable y folio correlativo.
- Libro de folios: rangos, asignación a responsable, anulaciones.
- Vales de combustible: entregado sí/no, con folio, fecha y responsable.
- Anticipo pagado sí/no, con fecha y responsable.
- Pago final finalizado sí/no, con fecha, autorización y responsable.
- Montos opcionales. Separación entre autorización y ejecución del pago.
- Nunca permitir doble pago.

**GPS / Traccar (preparación para integración futura)**
- ABM de dispositivos, vinculación dispositivo ↔ chofer ↔ vehículo por CI.
- Schema para ingesta de eventos y posiciones.
- Clasificación activo/inactivo con criterio explícito.
- **NO conectar producción todavía.**

**Importación / exportación**
- Importador Excel/CSV/Google Sheets con staging, validación y resolución de conflictos.
- Registro de origen de planilla y apariciones.
- Exportación en XLSX, CSV, PDF.
- Exportación completa con 12 hojas XLSX.
- Planilla de firma generada desde la base.

**Reportes**
1. Choferes
2. Antecedentes
3. Lista negra
4. Excepciones
5. Cupos
6. Combustible
7. Anticipos
8. Pagos finales
9. Contratos
10. GPS/Traccar
11. Auditoría
12. Planilla de firma

**Seguridad y auditoría**
- Usuarios, roles y permisos granulares con RLS.
- 9 roles: super_admin, admin, coordinador, tesoreria, supervisor, candidato, operador, auditor, consulta.
- Bitácora de auditoría inmutable.
- Registro de exportaciones.
- Multi-organización con aislamiento por RLS.

**Búsqueda**
- Por CI (con autocompletado, acepta puntos), nombre, apellido, teléfono, chapa, marca, modelo, supervisor, candidato, barrio, número de orden.
- Coincidencia exacta por defecto. Parcial explícita.
- Preservación de acentos y mayúsculas.
- Server-side, con debounce, paginación, cancelación.

### 3.2 Fuera de alcance (v2)

- App móvil nativa (se contempla PWA responsive).
- Miembros de mesa y veedores.
- Geocercas por barrio y verificación de presencia en zona.
- Sincronización continua con Google Sheets.
- Cálculo de resultados electorales o proyecciones de voto.
- Firma digital con validez legal.
- Integración contable con sistemas externos.
- Transporte en tiempo real visible al votante.

### 3.3 Límite de uso

El sistema no tiene ninguna funcionalidad que vincule el pago de un chofer con su
comportamiento electoral. El padrón incluye afiliación y participación, consultables
como parte de la ficha; **ninguna regla de negocio, cálculo de pago ni condición de alta
los lee**. Las funciones de caja no reciben ni consultan `padron_participacion`.

## 4. Actores

| Actor | Rol | Descripción |
|---|---|---|
| Administrador general | `admin` / `super_admin` | Configura el operativo, cupos, usuarios, cierra la elección |
| Coordinador de logística | `coordinador` | Alta y asignación de choferes, gestiona excepciones |
| Tesorería / Caja | `tesoreria` | Emite folios, vales, anticipos y pagos; hace arqueo |
| Supervisor / Referente | `supervisor` | Ve y gestiona solo sus choferes y su barrio |
| Candidato / Concejal | `candidato` | Consulta solo sus choferes y su cupo |
| Operador de carga | `operador` | Carga datos, sin acceso a caja ni a lista negra |
| Auditor | `auditor` | Solo lectura total + acceso a bitácora |
| Consulta | `consulta` | Solo lectura limitada, sin datos de contacto ni montos |

## 5. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Disponibilidad | ≥ 99,5 %. Día D: pico crítico, degradación controlada, modo solo lectura de respaldo |
| Rendimiento | Búsqueda por CI < 300 ms. Listados paginados < 1 s con 10.000 registros |
| Concurrencia | ~50 usuarios simultáneos en pico; sin pérdida de escritura en cupos |
| Escala | Diseñado para 10.000 choferes y 200.000 filas de padrón |
| Conectividad | Alta de chofer usable en conexión inestable (optimistic UI + reintento) |
| Idioma | Español (Paraguay). Fechas `dd/MM/yyyy`, moneda Gs. sin decimales |
| Accesibilidad | WCAG 2.1 AA en formularios de carga |
| Retención | Indefinida. Sin purga automática |
| Aislamiento | Multi-organización por RLS |
| Responsive | 1920×1080, 1440×900, 1366×768, 1024, 768, 390, 375 |

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | Un CI no puede tener más de una participación activa como chofer en la misma elección |
| RN-02 | Un chofer sólo puede estar asignado a **un** candidato por elección |
| RN-03 | Un chofer en lista negra vigente no puede darse de alta sin excepción aprobada |
| RN-04 | Una excepción tiene aprobador distinto del solicitante, motivo y fecha de vencimiento |
| RN-05 | El alta se bloquea si el cupo de candidato, de barrio o de supervisor está agotado — los tres en cascada |
| RN-06 | No se emite vale de combustible ni anticipo sin contrato marcado como firmado |
| RN-07 | Un folio se asigna a un solo documento y no se reutiliza; la anulación queda registrada |
| RN-08 | El pago final se marca finalizado con fecha y responsable; si el chofer no tiene actividad, requiere excepción |
| RN-09 | Un mismo vehículo (chapa) no puede estar asignado a dos choferes activos a la vez |
| RN-10 | **El CI es obligatorio.** Una fila sin cédula se rechaza en la importación y no puede darse de alta |
| RN-11 | "Vota en Villa Hayes", local, mesa y orden se derivan del padrón importado; no se editan a mano |
| RN-12 | Todo registro guarda su origen, y toda aparición de un CI en una planilla queda archivada |
| RN-13 | Un chofer con antecedente negativo en elección anterior se marca en el alta, no se bloquea automáticamente |
| RN-14 | Ningún cálculo de pago, alta o cupo lee la afiliación partidaria ni la participación electoral |
| RN-15 | Ningún dato de una organización es visible desde otra |
| RN-16 | **Todo chofer tiene un responsable declarado** — el supervisor o concejal que lo presentó. Un alta sin responsable se rechaza |
| RN-17 | Un chofer que no figura en el padrón se acepta, marcado `fuera_de_padron` |
| RN-18 | Una entrada de lista negra usa un motivo del catálogo cerrado; `otro` exige detalle. Vigencia por defecto indefinida |
| RN-19 | Los choferes históricos NO aparecen automáticamente como choferes activos de la operación actual |
| RN-20 | La lista negra y los antecedentes son conceptos diferentes; nunca se mezclan |
| RN-21 | Una excepción NO elimina al chofer de la lista negra; es una entidad separada |
| RN-22 | No se permite doble pago — validación en backend/database, no solo frontend |

## 7. Criterios de aceptación de la Fase 0

- [x] Los documentos están escritos y revisados.
- [x] Auditoría de planillas y de padrón completadas.
- [x] **Las 21 decisiones respondidas y aplicadas al modelo.**
- [x] El modelo de datos está validado contra los 11 riesgos de la auditoría.
- [x] Fecha del Día D confirmada (4 de octubre) y roadmap calculado.
- [ ] **Padrón re-exportado en UTF-8** — bloqueante técnico.
- [ ] El responsable del proyecto aprueba antes de la primera migración.
