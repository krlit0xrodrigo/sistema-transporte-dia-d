# Flujos operativos

Versión 0.2 — decisiones D-01 a D-19 aplicadas · 2026-09-12

---

## 1. Alta de chofer

El flujo más crítico del sistema: es donde se evitan los 64 duplicados, el sobre-cupo y el
alta de alguien en lista negra.

```
[Ingresa CI]
     │
     ▼
┌─────────────────────────────┐
│ 1. Normalizar CI            │  solo dígitos, sin ceros a la izquierda
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐   existe ┌──────────────────────────────┐
│ 2. ¿Existe la persona?      ├─────────▶│ Cargar ficha + antecedentes  │
└──────────┬──────────────────┘          └───────────┬──────────────────┘
     no existe                                       │
           ▼                                         ▼
┌─────────────────────────────┐          ┌──────────────────────────────┐
│ 3. Buscar en padrón por CI  │          │ 4. ¿Ya es chofer en ESTA      │
│    → nombre, local, mesa    │          │    elección?                  │
└──────────┬──────────────────┘          └───┬───────────────────┬──────┘
           │                                  sí                  no
           │                                  ▼                   │
           │                        ⛔ BLOQUEO: duplicado         │
           │                        Mostrar ficha existente       │
           ▼                                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. Validaciones en cadena                                            │
│    a) CI vacío o inválido        → ⛔ RECHAZO (D-18)                 │
│    b) Lista negra vigente        → ⛔ bloqueo (o excepción)          │
│    c) No está en el padrón de VH → ⚠️ marca `fuera_de_padron` (D-21) │
│    d) Nombre ≠ nombre del padrón → ⚠️ conflicto, requiere revisión   │
│    e) Antecedente negativo       → ⚠️ advertencia, no bloquea        │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. Datos: candidato · barrio · supervisor · estado · vehículo        │
│    Todos desde catálogo. Nada de texto libre.                        │
│    Local, mesa y orden vienen del padrón, no se cargan.              │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 7. Cupo EN CASCADA: candidato Y barrio Y supervisor (D-05)           │
│    Cualquiera agotado → ⛔ bloqueo, con opción de excepción          │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 8. fn_alta_chofer()  — TRANSACCIÓN ÚNICA                             │
│    personas (upsert) → choferes → asignaciones → chofer_vehiculos    │
│    → apariciones_origen → cupo_movimientos ×3 → audit_log            │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
              Chofer en estado `activo`, listo para contrato
```

### Estados del chofer

```
borrador ──▶ activo ──┬──▶ suspendido ──▶ activo
                      └──▶ baja  (terminal, no se borra)
```

### Reglas del alta

| Situación | Resultado |
|---|---|
| **Sin CI** | **Rechazo.** No se crea la persona (D-18). El importador lo informa como fila rechazada |
| CI ya es chofer activo en la elección | **Bloqueo duro.** Se muestra la ficha, quién lo cargó y la aparición previa |
| CI en lista negra `bloqueo_total` vigente | **Bloqueo**, sólo excepción aprobada lo habilita |
| CI en lista negra `advertencia` | Alta permitida con confirmación explícita registrada |
| CI no encontrado en el padrón de Villa Hayes | Alta permitida, marcada `fuera_de_padron` (70 casos actuales — D-21) |
| CI en el padrón pero con otro nombre | Conflicto: requiere revisión manual (3 casos detectados) |
| Cualquiera de los tres cupos agotado | Bloqueo + flujo de excepción |
| Vehículo con chapa ya asignada a otro chofer activo | Bloqueo (RN-09) |

### Qué muestra la ficha cuando el CI estaba duplicado (D-03)

```
⚠️  Este CI apareció 3 veces en las planillas de origen:

    · Choferes, fila 32   — Concejal Venus Nuñez · Barrio Alonso   ← ACTIVA
    · Choferes, fila 382  — Concejal Negro Nuñez · (sin barrio)      archivada
    · Choferes, fila 602  — Concejal Negro Nuñez · (en mayúsculas)   archivada

    Participación activa: una sola (Venus Nuñez). Resuelto por María López, 12/09/2026.
```

Las apariciones archivadas no se borran nunca: viven en `apariciones_origen` y siguen siendo
consultables y exportables.

## 2. Consulta

Tres vías, una sola fuente:

1. **Búsqueda rápida por CI** — camino principal en campo. Objetivo < 300 ms. Devuelve ficha
   completa según permisos.
2. **Búsqueda por nombre** — con `pg_trgm` (tolerante a errores de tipeo, porque los nombres
   están sucios). Muestra siempre CI enmascarado para desambiguar homónimos: la auditoría
   detectó 5 nombres con más de un CI.
3. **Listados filtrados** — por candidato, barrio, supervisor, estado, actividad GPS, estado de
   pago. Paginación server-side, export sujeto a permiso.

**Ficha del chofer** (secciones visibles según rol):

| Sección | Contenido | Permiso |
|---|---|---|
| Identidad | Nombre, CI (enmascarado según rol), teléfono, verificación en padrón | `choferes.ver` / `choferes.ver_pii` |
| Asignación | Candidato, barrio, supervisor, historial de cambios | `choferes.ver` |
| Vehículo | Categoría, marca, modelo, chapa | `choferes.ver` |
| Padrón | Local, mesa, orden, dirección, afiliación, participación por elección | `padron.consultar` |
| Actividad GPS | Dispositivo, **km recorridos**, ventana horaria, activo/inactivo | `gps.ver` |
| Contrato y caja | Folio, firmado s/n, vale entregado s/n, anticipo pagado s/n, pago finalizado s/n | `caja.ver` |
| Antecedentes | Elecciones anteriores, resultado, confiabilidad del dato | `choferes.ver` |
| **Apariciones de origen** | Todas las veces que este CI figuró en una planilla | `choferes.ver` |
| Alertas | Lista negra, excepciones, fuera de padrón, duplicado resuelto | según rol |
| Bitácora | Quién tocó qué y cuándo | `auditoria.ver` |

Toda consulta al padrón o a la lista negra queda registrada en `accesos_sensibles`.

## 3. Lista negra

```
Solicitud ──▶ Revisión ──▶ Alta en lista negra ──▶ Vigente ──┬──▶ Vencida
   │            │                                            └──▶ Revocada
   │            └── rechazada
   └── cualquier rol con `excepciones.solicitar` puede reportar
```

**Alta:** requiere `lista_negra.gestionar` (sólo admin). Campos obligatorios: persona (por CI),
`motivo_codigo` de catálogo, detalle en texto, severidad, vigencia y **evidencia**. Sin
evidencia no se registra.

**Efecto inmediato:** cualquier intento de alta de esa persona como chofer —en esta o en
futuras elecciones— se bloquea, porque la lista negra vive a nivel `personas`.

**Revocación:** requiere motivo y queda registrada; la entrada original **nunca se borra**.

**Visibilidad:** ni supervisores ni candidatos ven la lista negra ni el motivo. Ven
"no habilitado — consultar con coordinación". Esto evita filtración de información sensible
sobre personas y reduce el riesgo reputacional.

**Catálogo de motivos propuesto** (a confirmar — D-06): incumplimiento del operativo anterior,
cobro sin prestar servicio, documentación falsa, vehículo no habilitado, conducta, doble
imputación entre candidatos, a pedido de la persona.

## 4. Excepciones

```
[Bloqueo detectado]
        ▼
Solicitud  (solicitante, tipo, motivo, evidencia, chofer/persona)
        ▼
Estado: pendiente ──▶ notificación a aprobadores
        ▼
┌── aprobada (aprobador ≠ solicitante, con vencimiento) ──▶ desbloquea la acción
├── rechazada (con motivo)
└── vencida (automático al pasar `vence_en`)
```

- Una excepción **habilita una acción concreta**, no abre el sistema: `tipo` acota qué desbloquea.
- Toda excepción aprobada queda referenciada en el registro que habilitó (`cupo_movimientos.excepcion_id`,
  `pagos_finales.excepcion_id`), así el reporte "qué se hizo por excepción" es una consulta directa.
- Vencimiento obligatorio. Sin vencimiento no hay control.
- Reporte semanal de excepciones por aprobador — una concentración anómala es una señal de alerta.

## 5. Cupos

**Definición (D-05: los tres en cascada).** El admin carga cupos por candidato (p. ej. Venus
Nuñez 375), por barrio (Alonso 93) y por supervisor. **Un alta consume los tres a la vez**: si
cualquiera está agotado, el alta se bloquea. Un ámbito sin cupo definido no restringe.

**Consumo.**

```sql
-- dentro de fn_consumir_cupo, en la misma transacción del alta
select limite into l from cupos where id = p_cupo_id for update;   -- bloqueo de fila
select coalesce(sum(delta),0) into usado from cupo_movimientos where cupo_id = p_cupo_id;
if usado + 1 > l and p_excepcion_id is null then
   raise exception 'CUPO_AGOTADO';
end if;
insert into cupo_movimientos(...) values (..., +1, ...);
```

El `for update` es lo que impide que dos altas simultáneas el Día D pasen el límite.

**Liberación.** La baja de un chofer inserta un movimiento `−1`. El cupo nunca se "edita".

**Visualización.** Semáforo por ámbito: verde < 80 %, amarillo 80–99 %, rojo = 100 %.
Alerta al admin cuando un cupo llega a 90 %.

**Carga inicial.** La `Hoja 1` del reporte (40 referentes, total 2.136, 18 en cero) es el
insumo, pero sus claves están compuestas a mano (`Raquel Olmedo - Barrio Pañete` aparece 3 veces
con barrios distintos). Requiere desambiguación humana antes de cargar (D-05).

## 6. Caja

### 6.1 Cadena de documentos

> **D-09 y D-16 aplicados:** el flujo registra **estados con fecha y responsable**, no
> liquidaciones. Los montos son campos opcionales: se cargan si se conocen, y recién ahí se
> activan el libro de caja y el arqueo.

```
Chofer activo
   ▼
[Contrato]        folio · ☑ firmado · fecha · responsable        (monto opcional)
   ▼
[Vale combustible] folio · ☑ entregado · fecha · responsable      (monto/litros opcionales)
   ▼
[Anticipo]        folio · ☑ pagado · fecha · responsable          (monto opcional)
   ▼  (Día D + actividad registrada)
[Pago final]      folio · ☑ finalizado · fecha · autorizado por   (monto opcional)
   ▼
[Movimiento de caja] ─ sólo si hay monto cargado ─▶ [Arqueo]
```

### 6.2 Reglas

| # | Regla |
|---|---|
| C1 | Ningún documento de caja existe sin folio asignado por `fn_asignar_folio` |
| C2 | Sin contrato marcado como firmado no hay vale ni anticipo |
| C3 | El pago final de un chofer sin actividad registrada requiere excepción aprobada |
| C4 | Quien autoriza (`admin`) no es quien marca el pago (`tesoreria`) |
| C5 | Toda marca lleva **fecha y usuario**. Un `SI` sin autor no es un registro |
| C6 | Un folio anulado no se reutiliza; la anulación lleva motivo y responsable |
| C7 | **Doble pago imposible:** índice único `(chofer_id, eleccion_id)` en pagos no anulados |
| C8 | `movimientos_caja` es append-only: una corrección es un contramovimiento |

### 6.3 Montos y arqueo (opcionales en v1)

No hay tabla de montos definida y no se inventa ninguna. Los campos `monto` existen en las
cuatro tablas y aceptan nulo. Mientras estén vacíos, el sistema hace control **documental**
(quién firmó, quién cobró, con qué folio). Si más adelante se cargan montos, el libro de caja y
el arqueo —saldo inicial + ingresos − egresos vs. declarado— se activan sin ninguna migración.

**Lo que se gana y lo que no:** con estados se elimina el doble pago, el folio perdido y el
"no sé si cobró". Lo que no se puede detectar sin montos es una diferencia de plata. Es una
decisión consciente del proyecto, no una omisión del diseño.

## 7. Importación

```
[Archivo Excel/CSV]  o  [Google Sheet]
        ▼
1. Registro: origen, nombre, sha256, hoja, usuario
   → si el hash ya existe: aviso de reimportación
        ▼
2. Parseo a `importacion_filas.datos_crudos` (jsonb, fila tal cual)
        ▼
3. Normalización → `datos_normalizados`
   · CI: solo dígitos, sin .0 de Excel, sin ceros a la izquierda
   · Teléfono → E.164 (+595…); los truncados (`0975`, `098`) → inválido
   · Nombres: trim, colapso de espacios, capitalización
   · Catálogos: barrio/candidato/supervisor vía `alias_catalogo`
   · SI/NO → boolean; vacío → NULL (nunca false)
        ▼
4. Validación contra el padrón y estado por fila
   ok         │ rechazada (sin CI → D-18, no se crea nada)
   conflicto  │ (CI repetido en el archivo, CI ya existe, nombre ≠ padrón, chapa repetida)
        ▼
5. INFORME PREVIO (no escribe nada en dominio)
   "695 filas · 541 ok · 20 RECHAZADAS (sin CI) · 134 conflicto (64 CI repetidos)
    535 verificados en el padrón · 70 fuera de padrón · 3 con nombre discrepante"
        ▼
6. Resolución humana de conflictos, fila por fila
   [usar existente] [crear nuevo] [fusionar] [omitir]
   Toda aparición queda archivada en `apariciones_origen`, se aplique o no (D-03)
        ▼
7. fn_confirmar_importacion()  ← requiere `datos.confirmar_importacion`
   Aplica sólo filas `ok` + conflictos resueltos. Transacción única.
        ▼
8. Resultado + posibilidad de revertir el lote completo
```

**Reglas:**

- El importador **nunca** deduplica por nombre. Sólo por CI. Pero **sí compara el nombre contra
  el padrón** después de cruzar por CI: así se detectan los CI mal tipeados (3 casos).
- **Una fila sin CI se rechaza** (D-18). No se crea persona ni registro parcial.
- Se guarda `origen_planilla_id` en cada registro y una fila en `apariciones_origen` por cada
  vez que el CI figura, aplicada o no.
- La importación es **idempotente por hash**: el mismo archivo no entra dos veces sin confirmación.
- Google Sheets usa el mismo pipeline y **es sólo carga inicial** (D-19): no hay sincronización.

## 8. Exportación

| Reporte | Formato | Contenido | Permiso |
|---|---|---|---|
| Planilla por barrio | PDF, XLSX | Listado para firmar en papel — **reemplaza las 21 hojas manuales** | `datos.exportar` |
| Planilla por candidato | PDF, XLSX | Ídem, agrupado por concejal | `datos.exportar` |
| Listado de choferes | XLSX, CSV | Con o sin PII según permiso | `datos.exportar` / `datos.exportar_pii` |
| Resumen del operativo | PDF | Totales, activos/inactivos, por candidato | `reportes.ver` |
| Reporte de actividad GPS | XLSX | Por chofer, con km y criterio | `gps.ver` |
| Reporte de caja | XLSX, PDF | Contratos, vales, anticipos, pagos, arqueo | `reportes.ver_montos` |
| Control de folios | XLSX | Serie, usados, anulados, disponibles | `folios.ver` |
| Bitácora de auditoría | CSV | Filtrada por rango y tabla | `auditoria.exportar` |

**Controles obligatorios en toda exportación:**

1. Registro en `exportaciones` (usuario, filtros, cantidad de filas, si incluye PII).
2. Pie de página con usuario, fecha/hora y un identificador de exportación
   → un PDF filtrado es rastreable hasta quien lo generó.
3. Los datos personales se exportan sólo con `datos.exportar_pii`; el resto recibe CI enmascarado.
4. Límite de filas por exportación y alerta al admin ante exportaciones masivas.

## 9. Cierre del operativo

1. Se congela el alta de choferes.
2. Se recalcula `actividad_diaria` con el criterio definitivo y se versiona.
3. Se liquidan pagos finales pendientes.
4. Se cierra caja y se hace el arqueo final.
5. Se generan los `antecedentes` de cada persona a partir de la elección.
6. Se revocan scopes y roles operativos; queda sólo lectura.
7. La elección pasa a estado `cerrada`: sus datos son inmutables.
