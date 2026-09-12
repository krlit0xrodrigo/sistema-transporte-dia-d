# SPEC.md — Especificación funcional

**Sistema de gestión de choferes — Logística Día D, Villa Hayes**
Versión 0.2 — decisiones D-01 a D-19 aplicadas · 2026-09-12

---

## 1. Problema

La logística de transporte del Día D se administra hoy en planillas Excel/Google Sheets
compartidas. La auditoría (`docs/audit-datos.md`) muestra que ese esquema ya falló en lo
esencial: 64 CI duplicados con imputación cruzada entre candidatos, 0 % de registro de
contratos y pagos, control de actividad GPS cruzado por nombre, y 22 registros que se pierden
entre el maestro y el reporte.

El sistema debe garantizar tres cosas que la planilla no puede:

1. **Un chofer = una persona = un CI = un pago.**
2. **Toda plata y todo folio tienen dueño, fecha y responsable.**
3. **Todo cambio queda registrado y es reversible en la lectura.**

## 2. Objetivos

| # | Objetivo | Métrica de éxito |
|---|---|---|
| O1 | Eliminar duplicados de chofer | 0 CI repetidos activos por elección |
| O2 | Digitalizar contrato, combustible, anticipo y pago final | 100 % de pagos con respaldo y folio |
| O3 | Controlar cupos por candidato/barrio/supervisor | 0 altas sobre cupo sin excepción aprobada |
| O4 | Verificar actividad real por GPS ligada al CI | 100 % de choferes con GPS vinculados por `device_id`, no por nombre |
| O5 | Trazabilidad completa | Toda escritura con autor, timestamp y valor anterior |
| O6 | Reducir el tiempo de alta de un chofer | Alta validada en < 2 minutos |

## 3. Alcance

### 3.1 Dentro de alcance

**Identidad y catálogos**
- Personas (CI único, normalizado), con roles múltiples por elección.
- Catálogo de barrios de Villa Hayes, con locales de votación y alias de importación.
- Catálogo de candidatos/concejales, con lista, orden y datos de preferencial.
- Catálogo de supervisores/referentes, vinculado a persona.
- Catálogo de vehículos (categoría, marca, modelo, chapa), independiente del chofer.

**Padrón electoral** *(archivo recibido — 35.192 registros, ver `docs/audit-padron.md`)*
- Importación de snapshot del padrón de Villa Hayes (solo lectura, versionado).
- Validación automática de "vota en Villa Hayes", local, mesa y orden, reemplazando el campo
  manual — que tenía **89 errores comprobables** sobre 538 declaraciones.
- Enriquecimiento de la ficha con dirección, afiliación partidaria y seccional.
- Historial de participación por elección (`padron_participacion`), en formato largo.
- Consulta de padrón desde la ficha del chofer, registrada en la bitácora de accesos.

**Choferes y asignaciones**
- Alta de chofer con validación de CI, padrón, lista negra, cupo y duplicados.
- Asignación a candidato + barrio + supervisor, con historial de cambios.
- Estado de servicio (contratado / voluntario / otros a definir — ver D-03).
- Ficha unificada con antecedentes de elecciones anteriores.

**Control y excepciones**
- Lista negra a nivel persona, con motivo, evidencia, vigencia y responsable.
- Excepciones formales para habilitar altas bloqueadas o sobre cupo, con aprobador y vencimiento.
- Antecedentes históricos por elección (cumplió/no cumplió, km, incidentes, pagos).

**Cupos**
- Definición de cupo por candidato, por barrio y por supervisor, por elección.
- Consumo en tiempo real y bloqueo al alcanzar el límite.

**Contratos y caja** *(alcance definido por D-09 y D-16)*
- Contrato: **marca de firmado** con fecha y responsable, con folio correlativo. Sin generación
  de PDF ni evidencia fotográfica obligatoria.
- Libro de folios: rangos, asignación a responsable, anulaciones.
- Vales de combustible: entregado sí/no, con folio, fecha y responsable.
- **Anticipo pagado sí/no** y **pago final finalizado sí/no**, con fecha y responsable.
- **Los montos son opcionales:** los campos existen y se pueden cargar cuando se conozcan, pero
  ninguna regla los exige. No hay cifras definidas y no se inventa ninguna.
- Arqueo y libro de caja disponibles, activables cuando se carguen montos.

**GPS / Traccar**
- ABM de dispositivos, vinculación `dispositivo ↔ chofer ↔ vehículo` por CI.
- Ingesta de eventos y posiciones (resumen diario), cálculo de km y ventana de actividad.
- Clasificación activo/inactivo con criterio explícito y auditable.

**Importación / exportación**
- Importador Excel/CSV/Google Sheets con staging, validación y resolución de conflictos.
  **Google Sheets es sólo importación inicial** (D-19): no hay sincronización continua.
- Registro de **origen de planilla** en cada registro y de **cada aparición** de un CI en una
  planilla, incluso las descartadas (D-03) — es lo que permite mostrar "este CI apareció 3 veces".
- Exportación de planillas por barrio/candidato/supervisor en PDF y Excel, generadas desde la base.
- Reportes: resumen general, por candidato, por barrio, de caja, de actividad GPS.

**Seguridad y auditoría**
- Usuarios, roles y permisos granulares con RLS.
- Bitácora de auditoría inmutable de toda escritura y de los accesos sensibles.
- Registro de exportaciones (quién exportó qué y cuándo).

**Multi-organización** *(D-12)*
- Una instancia atiende varios operativos políticos, aislados entre sí por `organizacion_id`
  y por RLS. Ninguna organización ve datos de otra.

### 3.2 Fuera de alcance (v1)

- App móvil nativa (se contempla PWA responsive).
- **Miembros de mesa y veedores** (D-07): fuera por completo. Los 130 registros quedan como
  archivo histórico, sin tabla en el sistema.
- Geocercas por barrio y verificación de presencia en zona (D-15).
- Sincronización continua con Google Sheets (D-19).
- Cálculo de resultados electorales o proyecciones de voto.
- Firma digital con validez legal (D-09: sólo marca de firmado).
- Integración contable con sistemas externos.
- Transporte en tiempo real visible al votante.

### 3.3 Límite de uso

El sistema no tiene ninguna funcionalidad que vincule el pago de un chofer con su
comportamiento electoral. El padrón importado incluye afiliación partidaria y participación por
elección, y esos campos se consultan como parte de la ficha (decisión del responsable del
proyecto); **ninguna regla de negocio, cálculo de pago ni condición de alta los lee**. Esa
separación está documentada en `docs/security.md` §6 y es verificable en el código: las
funciones de caja no reciben ni consultan `padron_participacion`.

## 4. Actores

| Actor | Descripción |
|---|---|
| Administrador general | Configura el operativo, cupos, usuarios, cierra la elección |
| Coordinador de logística | Alta y asignación de choferes, gestiona excepciones |
| Tesorería / Caja | Emite folios, vales, anticipos y pagos; hace arqueo |
| Supervisor / Referente | Ve y gestiona solo sus choferes y su barrio |
| Candidato / Concejal | Consulta solo sus choferes y su cupo |
| Operador de carga | Carga datos, sin acceso a caja ni a lista negra |
| Auditor | Solo lectura total + acceso a bitácora |
| Consulta | Solo lectura limitada, sin datos de contacto ni montos |

## 5. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Disponibilidad | ≥ 99,5 %. **El Día D es un pico crítico**: el sistema debe soportar el operativo completo con degradación controlada y modo de solo lectura de respaldo. |
| Rendimiento | Búsqueda de chofer por CI < 300 ms. Listados paginados < 1 s con 10.000 registros. |
| Concurrencia | ~50 usuarios simultáneos en pico; sin pérdida de escritura en cupos (control transaccional). |
| Escala | Diseñado para 10.000 choferes y 200.000 filas de padrón sin cambio de arquitectura. |
| Conectividad | Alta de chofer usable en conexión inestable (optimistic UI + reintento); el operativo de campo no siempre tiene buena señal. |
| Idioma | Español (Paraguay). Fechas `dd/MM/yyyy`, moneda Gs. sin decimales. |
| Accesibilidad | WCAG 2.1 AA en formularios de carga. |
| Retención | **Indefinida** (D-10). Sin purga automática. El sistema conserva el histórico completo entre operativos, que es lo que hace posibles los antecedentes. |
| Aislamiento | Multi-organización por RLS (D-12). El aislamiento se prueba con tests que intentan el cruce y esperan cero filas. |

## 6. Reglas de negocio candidatas

> Las marcadas 🔶 siguen requiriendo confirmación (ver `docs/decisiones-pendientes.md`).

| ID | Regla |
|---|---|
| RN-01 | Un CI no puede tener más de una participación activa como chofer en la misma elección. |
| RN-02 | Un chofer sólo puede estar asignado a **un** candidato por elección. ✅ D-17 |
| RN-03 | Un chofer en lista negra vigente no puede darse de alta sin excepción aprobada. |
| RN-04 | Una excepción tiene aprobador distinto del solicitante, motivo y fecha de vencimiento. |
| RN-05 | El alta se bloquea si el cupo **de candidato, de barrio o de supervisor** está agotado — los tres en cascada. ✅ D-05 |
| RN-06 | No se emite vale de combustible ni anticipo sin contrato marcado como firmado. |
| RN-07 | Un folio se asigna a un solo documento y no se reutiliza; la anulación queda registrada. |
| RN-08 | El pago final se marca finalizado con fecha y responsable; si el chofer no tiene actividad registrada, requiere excepción aprobada. |
| RN-09 | Un mismo vehículo (chapa) no puede estar asignado a dos choferes activos a la vez. |
| RN-10 | **El CI es obligatorio.** Una fila sin cédula se rechaza en la importación y no puede darse de alta. ✅ D-18 |
| RN-11 | "Vota en Villa Hayes", local, mesa y orden se derivan del padrón importado; no se editan a mano. ✅ D-01 |
| RN-12 | Todo registro guarda su origen, y **toda aparición de un CI en una planilla queda archivada**, incluso las no aplicadas. ✅ D-03 |
| RN-13 | Un chofer con antecedente negativo en elección anterior se marca en el alta, no se bloquea automáticamente. 🔶 |
| RN-14 | Ningún cálculo de pago, alta o cupo lee la afiliación partidaria ni la participación electoral del padrón. |
| RN-15 | Ningún dato de una organización es visible desde otra. ✅ D-12 |

## 7. Criterios de aceptación de la Fase 0

- [x] Los documentos están escritos y revisados.
- [x] Auditoría de planillas y de padrón completadas.
- [x] 16 de 21 decisiones respondidas y aplicadas al modelo.
- [x] El modelo de datos está validado contra los 11 riesgos de la auditoría.
- [ ] Padrón re-exportado en UTF-8 (bloqueante para la Fase 3).
- [ ] D-06, D-11, D-14, D-20 y D-21 respondidas.
- [ ] El responsable del proyecto aprueba antes de crear la primera migración.
