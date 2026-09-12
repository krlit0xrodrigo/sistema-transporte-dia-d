# ROADMAP

Versión 0.2 — decisiones D-01 a D-19 aplicadas · 2026-09-12

> Las duraciones son estimaciones relativas, no compromisos. La fecha objetivo del próximo
> Día D sigue pendiente (D-20) y es lo que fija el calendario real.

---

## Fase 0 — Arquitectura y planificación ← **ESTÁS ACÁ**

**Objetivo:** que nadie escriba una línea de código sobre supuestos.

| Entregable | Estado |
|---|---|
| Auditoría de repositorio y planillas (`docs/audit-datos.md`) | ✅ |
| Auditoría del padrón, 35.192 registros (`docs/audit-padron.md`) | ✅ |
| Especificación funcional (`SPEC.md`) | ✅ |
| Arquitectura (`docs/architecture.md`) | ✅ |
| Modelo de datos y RLS (`docs/database.md`) | ✅ |
| Roles y permisos (`docs/permissions.md`) | ✅ |
| Flujos operativos (`docs/workflows.md`) | ✅ |
| Seguridad y testing (`docs/security.md`) | ✅ |
| Integración GPS (`docs/traccar.md`) | ✅ |
| Decisiones (`docs/decisiones-pendientes.md`) | ✅ **16 de 21 resueltas** |
| Modelo actualizado con las decisiones (v0.2) | ✅ |
| Repositorio conectado | ✅ `krlit0xrodrigo/sistema-transporte-dia-d` |
| **Aprobación escrita del responsable** | ⏳ |

**Criterio de salida:** las 5 decisiones 🔴 están resueltas (D-01 padrón entregado, D-02 repo,
D-03 duplicados, D-10 retención, D-13 legal autorizado). Falta la aprobación final de la
arquitectura v0.2. Quedan abiertas D-06, D-11, D-14, D-20 y D-21, ninguna bloquea la Fase 1.

---

## Fase 1 — Fundaciones

**Objetivo:** un esqueleto seguro y desplegado, con identidad y catálogos. Cero funcionalidad de negocio.

- Repositorio, estructura, TypeScript estricto, linting, CI.
- Proyectos Supabase: local, preview, staging, producción.
- Migraciones de: **`organizaciones`**, `elecciones`, `barrios`, `locales_votacion` (los 7
  reales del padrón), `mesas`, `candidatos`, `supervisores`, `alias_catalogo`, `usuarios`,
  `roles`, `permisos`, `usuario_roles`, `rol_permisos`, `usuario_scopes`, `origenes_planilla`.
- **`organizacion_id` en toda tabla de dominio desde la primera migración** (D-12). Agregarlo
  después significa migrar 45 tablas y reescribir todas las políticas.
- Trigger genérico de `audit_log` + `accesos_sensibles`.
- Supabase Auth con MFA, middleware de sesión, layout base con shadcn/ui.
- Despliegue en Vercel + Cloudflare con cabeceras y rate limiting.
- Suite pgTAP inicial: RLS de catálogos y de usuarios.

**Criterio de salida:** los 9 roles pueden iniciar sesión, cada uno ve exactamente lo que la
matriz dice, y hay un test que lo demuestra. Ninguna tabla sin RLS y **ninguna fila visible
entre organizaciones** (ambas verificadas en CI).

---

## Fase 2 — Núcleo: personas, choferes y asignaciones

**Objetivo:** el corazón del sistema, con las restricciones que impiden repetir el desastre de duplicados.

- `personas`, `vehiculos`, `choferes`, `chofer_vehiculos`, `asignaciones`, `antecedentes`.
- Índices únicos: un chofer por persona y elección; una asignación vigente; un vehículo activo.
- `fn_alta_chofer` con todas las validaciones encadenadas.
- Pantallas: alta, ficha, búsqueda por CI, búsqueda difusa por nombre, listados filtrados.
- Enmascaramiento de PII por rol mediante vistas.
- Historial de asignaciones.

**Criterio de salida:** es **imposible** crear dos choferes con el mismo CI en la misma
elección, probado con un test de concurrencia. Alta completa en menos de 2 minutos.

---

## Fase 3 — Importación y migración de los datos actuales

**Objetivo:** meter los 695 registros reales, limpios, con trazabilidad.

- `importaciones`, `importacion_filas`, `apariciones_origen`, normalizadores de CI y teléfono.
- Importador Excel/CSV con staging, informe previo y resolución de conflictos fila por fila.
- Carga de catálogos y de `alias_catalogo` con las variantes detectadas.
- **Importación del padrón (35.192 filas) + `padron_participacion` (~95.000 filas).**
  🔴 Bloqueante previo: **re-exportar el CSV en UTF-8** — el archivo actual tiene 2.031
  apellidos con la Ñ perdida y no es reparable por conversión.
- Verificación automática contra padrón: deriva "vota en Villa Hayes", local, mesa y orden.
- Rechazo de las 20 filas sin CI (D-18) con informe.
- **Sesión de trabajo humana** para resolver los 64 CI duplicados, dejando una participación
  activa y el resto archivado en `apariciones_origen` (D-03).
- Revisión de los 3 CI con nombre discrepante contra el padrón.
- Carga de `antecedentes` del 07/06/2026 marcados con confiabilidad baja.

**Criterio de salida:** ~605 choferes con CI válido, 0 duplicados activos, 535 verificados en el
padrón, cada registro con su origen identificado y cada aparición archivada, más un informe de
qué se decidió con cada conflicto.

---

## Fase 4 — Control: lista negra, excepciones y cupos

- `lista_negra`, `excepciones`, `cupos`, `cupo_movimientos`.
- `fn_consumir_cupo_cascada` con bloqueo transaccional sobre los tres ámbitos (D-05).
- Flujo de solicitud/aprobación de excepciones con separación de funciones.
- Tablero de cupos con semáforo y alertas al 90 %.
- Integración de los tres controles en el alta de chofer.

**Criterio de salida:** prueba de carga con 50 altas simultáneas contra el mismo cupo → cero
sobre-cupo. Ninguna excepción aprobada por su propio solicitante.

---

## Fase 5 — Contratos, folios y caja

**El módulo de mayor valor: hoy no existe registro digital de nada de esto.**

- `folios_series`, `folios`, `contratos`, `vales_combustible`, `anticipos`, `pagos_finales`,
  `movimientos_caja`, `arqueos`.
- `fn_asignar_folio` con `for update skip locked`.
- Marcas de estado con fecha y responsable: firmado, vale entregado, anticipo pagado, pago
  finalizado (D-09, D-16). **Sin generación de PDF.**
- Campos de monto opcionales; libro de caja y arqueo disponibles pero no obligatorios.
- Flujo autorización → marca de pago con roles separados.

**Criterio de salida:** un folio no se puede repetir ni bajo concurrencia; un chofer no puede
figurar como pagado dos veces; toda marca tiene autor y fecha.

---

## Fase 6 — GPS / Traccar

- `dispositivos_gps`, `traccar_eventos`, `actividad_diaria`.
- Job de sincronización idempotente con ventana incremental.
- ABM de dispositivos y vinculación por CI.
- `fn_recalcular_actividad` con criterio `v1_movimiento` versionado (D-04): activo = hubo
  movimiento, **sin umbral de km**; los km se muestran como información.
- Panel de actividad y conexión con el pago final.
- *Sin geocercas* (D-15).

**Criterio de salida:** 100 % de los dispositivos vinculados por FK, ningún cruce por nombre.
Recálculo del criterio sin perder la clasificación anterior.

---

## Fase 7 — Reportes, exportaciones y Google Sheets

- Reportes: resumen, por candidato, por barrio, de actividad, de caja, de folios.
- Exportación PDF/XLSX de planillas por barrio y candidato — **reemplaza las 21 hojas manuales**.
- Marca de agua, registro en `exportaciones`, límites y alertas.
- Panel de auditoría consultable.
- *Sin sincronización con Google Sheets* (D-19): la importación inicial ya se hizo en la Fase 3.

**Criterio de salida:** las planillas de papel salen del sistema, no de Excel. Toda exportación
queda registrada y es rastreable.

---

## Fase 8 — Endurecimiento y preparación del Día D

- Pruebas de carga con volumen objetivo.
- Revisión de seguridad completa y test de penetración básico.
- Modo solo lectura, backups horarios, plan de contingencia en papel.
- Alertas y panel de salud.
- **Simulacro completo del operativo** con datos sintéticos y el equipo real.
- Capacitación de supervisores y tesorería, manual de uso.

**Criterio de salida:** simulacro superado, equipo capacitado, plan de contingencia probado.

---

## Fase 9 — Día D y cierre

- Monitoreo en vivo, soporte dedicado.
- Sincronización de GPS cada 5 minutos.
- Cierre del operativo: liquidación, arqueo final, generación de antecedentes, revocación de
  accesos, congelamiento de la elección.
- Retrospectiva y ajuste del modelo para el próximo operativo.

---

## Dependencias críticas

```
✅ D-01 D-02 D-03 D-04 D-05 D-07 D-08 D-09 D-10 D-12 D-13 D-15 D-16 D-17 D-18 D-19  aplicadas

🔴 Padrón re-exportado en UTF-8 ──────▶ Fase 3   (único bloqueante técnico abierto)
🟠 D-06 (motivos lista negra) ────────▶ Fase 4
🟠 D-21 (70 fuera de padrón) ─────────▶ Fase 3
🟡 D-11 (tamaño del equipo) ──────────▶ Fase 1 (matriz de permisos)
🟡 D-14 (responsable seguridad) ──────▶ Fase 8
🟡 D-20 (fecha del Día D) ────────────▶ todo el calendario
   D-13 (confirmación legal) ─────────▶ compuerta de producción, no de desarrollo
```

## Principio de priorización

Si hay que recortar alcance por tiempo, el orden de lo que **no** se recorta es:

1. Identidad sin duplicados (Fase 2) — sin esto todo lo demás miente.
2. Caja con folios (Fase 5) — es donde está la plata y el riesgo.
3. Cupos y excepciones (Fase 4) — es donde está el control.
4. GPS (Fase 6) — mejora la verificación, pero hay alternativa en papel.
5. Sheets y reportes avanzados (Fase 7) — se puede exportar a mano al principio.
