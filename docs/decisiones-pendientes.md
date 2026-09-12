# Decisiones

Actualizado 2026-09-12. **16 de 20 decisiones resueltas.** Quedan 4 abiertas + 1 nueva.

---

## Decisiones resueltas

| ID | Decisión | Resolución | Impacto aplicado |
|---|---|---|---|
| **D-01** | Padrón electoral | ✅ **Entregado** — `padron_vh_rows.csv`, 35.192 registros, cédula única, 7 locales. Auditado en `docs/audit-padron.md` | `padron_snapshots`, `padron_electoral`, `padron_participacion`, `locales_votacion` sembrados con datos reales. ⚠️ Falta re-exportar en UTF-8 |
| **D-02** | Repositorio | ✅ `github.com/krlit0xrodrigo/sistema-transporte-dia-d`, rama `main` | Repo inicializado con remoto configurado |
| **D-03** | 64 CI duplicados | ✅ **Una participación activa + historial de apariciones visible** | Nueva tabla `apariciones_origen`; la ficha muestra "este CI apareció N veces, en estas planillas, con estos candidatos" |
| **D-04** | Criterio de chofer activo | ✅ **Sin umbral de km.** Activo = hubo movimiento registrado; se muestran los km recorridos. Referencia: Internas ANR Municipales del 07/06/2026 | `actividad_diaria` sin umbral; `criterio_version = 'v1_movimiento'`; km como dato informativo |
| **D-05** | Estructura de cupos | ✅ **Los tres en cascada**: candidato + barrio + supervisor | `fn_consumir_cupo` valida los tres ámbitos |
| **D-07** | Miembros de mesa | ✅ **Fuera de v1** | Tabla `miembros_mesa` eliminada del modelo. Los 130 registros quedan como archivo histórico |
| **D-08** | Acceso de candidatos | ✅ **Sí, sólo lo suyo** | Rol `candidato` con scope propio en RLS |
| **D-09** | Firma de contrato | ✅ **Sólo marca de firmado** | `contratos` sin generación de PDF ni evidencia obligatoria: `firmado`, `fecha_firma`, `registrado_por` |
| **D-10** | Retención | ✅ **Indefinida** | Sin purga automática. Documentado en `docs/security.md` §6 |
| **D-12** | Multi-organización | ✅ **Sí** | **`organizaciones` + `organizacion_id` en todo el modelo**, con RLS por organización |
| **D-13** | Base legal | ✅ **Autorizado a avanzar**; confirmación con asesoría legal **antes de producción** | Queda como compuerta de la Fase 8, no bloquea desarrollo |
| **D-15** | Geocercas | ✅ **No en v1** | Sin PostGIS. `barrios` sin polígono |
| **D-16** | Montos y caja | ✅ **Estados + montos opcionales.** Anticipo pagado s/n y pago final finalizado s/n, con fecha y responsable; el monto se puede cargar si se conoce | Tablas de caja conservadas con `monto` nulo permitido; arqueo disponible pero no obligatorio |
| **D-17** | Un chofer, ¿un candidato? | ✅ **Uno solo** | Índice único parcial sobre asignación vigente |
| **D-18** | 20 choferes sin CI | ✅ **Se descartan** | El importador los rechaza; sin estado `pendiente_identificacion`. CI obligatorio |
| **D-19** | Google Sheets | ✅ **Sólo import inicial** | Sin sincronización continua. `sincronizaciones_sheets` eliminada |
| — | Padrón: afiliación y participación | ✅ **Se importan sin restricción especial de acceso** | Visibles para los roles con `padron.consultar`. Nota de diseño en `docs/security.md` §6 |

---

## Decisiones abiertas

| ID | Estado | Decisión | Por qué importa | Opciones |
|---|:--:|---|---|---|
| **D-06** | 🟠 Lista negra | **Catálogo de motivos y vigencia por defecto.** | Sin catálogo cerrado vuelve el texto libre que ya ensució las planillas. Sin vigencia, el bloqueo es permanente por omisión. | **Propuesta a aprobar:** motivos = `incumplio_operativo`, `cobro_sin_servicio`, `documentacion_falsa`, `vehiculo_no_habilitado`, `conducta`, `doble_imputacion`, `a_pedido_de_la_persona`, `otro`. Vigencia por defecto: **indefinida** (coherente con D-10), revocable con motivo |
| **D-11** | 🟡 | **Tamaño real del equipo administrador.** | Si son menos de 3 personas, las separaciones de funciones (solicitar ≠ aprobar, autorizar ≠ pagar) no son aplicables tal cual y hay que definir el reemplazo. | (a) ≥ 3 personas → matriz como está · (b) 1–2 personas → se relaja la separación y se compensa con doble registro en bitácora y revisión posterior |
| **D-14** | 🟡 | **Responsable de seguridad designado.** | Sin dueño, los controles no se ejecutan. Es un nombre, no un cargo formal. | Nombrar persona |
| **D-20** | 🟡 | **Fecha objetivo del próximo Día D.** | Fija todo el calendario del roadmap y qué alcanza a construirse. | Confirmar fecha (la respuesta quedó cortada) |
| **D-21** | 🟠 Padrón | **70 choferes con CI que no están en el padrón de Villa Hayes.** | Son el 11,6 % de los choferes con CI. Pueden votar en otro distrito y ser válidos igual, o ser CI mal cargados. | (a) Se aceptan, marcados `fuera_de_padron` · (b) Requieren revisión antes del alta · (c) Se rechazan |

---

## Registro de cambios

| Fecha | Cambio |
|---|---|
| 2026-09-12 | Versión inicial con 20 decisiones abiertas |
| 2026-09-12 | 16 resueltas por el responsable del proyecto. Alta de D-21 tras la auditoría del padrón |
