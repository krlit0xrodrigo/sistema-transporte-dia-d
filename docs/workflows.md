# Flujos operativos v2

Versión 2.0 — 2026-09-12

---

## 1. Las dos puertas del sistema

### 🔎 PUERTA 1 — CONSULTA

"¿Quién es esta persona?"

```
[Ingresa CI]
     │
     ▼
Normalizar CI (solo dígitos, sin ceros)
     │
     ▼
Buscar en personas (org actual)
     │
     ├── ENCONTRADA ────────────────────────────┐
     │                                          │
     └── NO ENCONTRADA                          ▼
              │                        Mostrar FICHA DE PERSONA
              ▼                        ┌─────────────────────────────┐
         Buscar en padrón              │ DATOS PERSONALES            │
              │                        │   CI, nombre, teléfono      │
              ├── En padrón            │                             │
              │     → mostrar datos    │ PADRÓN                     │
              │                        │   ✅ ENCONTRADO / ❌ NO     │
              └── No en padrón         │   Local, mesa, orden       │
                    → "No encontrado"  │                             │
                    → Ofrecer alta     │ OPERACIÓN ACTUAL            │
                                       │   (vacío si no es chofer)   │
                                       │   Estado, asignación, orden │
                                       │                             │
                                       │ ANTECEDENTES HISTÓRICOS     │
                                       │   Elecciones anteriores     │
                                       │   Resultado, confiabilidad  │
                                       │                             │
                                       │ LISTA NEGRA                 │
                                       │   ⛔ / ✅                   │
                                       │                             │
                                       │ EXCEPCIONES                 │
                                       │   Activas, vencidas         │
                                       │                             │
                                       │ ASIGNACIÓN (si chofer)      │
                                       │   Candidato, barrio, super  │
                                       │                             │
                                       │ VEHÍCULO (si chofer)        │
                                       │   Chapa, marca, modelo      │
                                       │                             │
                                       │ GPS (si vinculado)          │
                                       │   Dispositivo, actividad    │
                                       │                             │
                                       │ CAJA (si chofer)            │
                                       │   Contrato, vale, anticipo  │
                                       │   Pago final                │
                                       │                             │
                                       │ AUDITORÍA (si permiso)      │
                                       │   Últimos cambios           │
                                       └─────────────────────────────┘
```

**Estados visuales en la ficha:**
- 🟢 OK — dato verificado, sin problemas
- 🟡 ADVERTENCIA — fuera de padrón, antecedente negativo
- 🔴 BLOQUEADO — lista negra vigente
- 🔵 INFORMACIÓN — dato informativo

**Reglas de la consulta:**
- NUNCA mezclar operación actual con antecedentes en la misma sección
- Antecedentes son de **solo lectura** e **inmutables**
- La consulta al padrón registra acceso en `accesos_sensibles`

---

### 🚗 PUERTA 2 — OPERACIÓN (Alta de chofer)

"¿Quiero incorporar esta persona como chofer actual?"

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
│    a) CI vacío o inválido        → ⛔ RECHAZO (RN-10)                │
│    b) Lista negra vigente        → ⛔ bloqueo (o excepción)          │
│    c) No está en el padrón de VH → ⚠️ marca `fuera_de_padron`       │
│    d) Nombre ≠ nombre del padrón → ⚠️ conflicto, revisión           │
│    e) Antecedente negativo       → ⚠️ advertencia, no bloquea        │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. Datos del formulario (React Hook Form + Zod)                      │
│    · candidato (catálogo)                                            │
│    · barrio (catálogo)                                               │
│    · supervisor (catálogo)                                           │
│    · estado de servicio (contratado/voluntario)                      │
│    · vehículo (chapa, marca, modelo, categoría)                     │
│    · RESPONSABLE que declara al chofer (obligatorio — RN-16)         │
│    Local, mesa y orden vienen del padrón, no se cargan.              │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 7. Cupo EN CASCADA: candidato Y barrio Y supervisor (RN-05)          │
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

---

## 2. Flujo de consulta/búsqueda

### Búsqueda por CI

```
[Escribe CI en campo de búsqueda]
     │ debounce 300ms
     ▼
AbortController cancela búsqueda anterior
     │
     ▼
Server Action: query con índice text_pattern_ops
     │ LIMIT 15
     │ RLS filtra por scope
     ▼
Autocompletado con resultados
     │
     ▼
Seleccionar → cargar ficha completa (queries paralelas)
```

### Búsqueda por nombre

```
[Escribe nombre en campo separado]
     │
     ▼
COINCIDENCIA EXACTA (default)
     │ sobre columna `nombres` O `apellidos`
     │ sensible a mayúsculas y acentos
     │ José ≠ Jose, GAMARRA ≠ Gamarra
     │
     ├── Resultados encontrados → mostrar
     │
     └── Sin resultados
              │
              ▼
         "N coincidencias con búsqueda parcial"
         [Botón: Buscar parcial]  ← EXPLÍCITO, nunca automático
```

---

## 3. Órdenes de transporte

```
Chofer activo
    │
    ▼
[Asignar número de orden]
    │ Número único por chofer
    │ Generado o asignado manualmente
    ▼
CHOFER ──── NÚMERO DE ORDEN ──── PLANILLA ──── FIRMA
    │
    ▼
Localizable por número de orden posteriormente
```

El concepto visible para el usuario es **ORDEN DE TRANSPORTE**.
No es necesario que el operador entienda complejidad de "folios".

---

## 4. Planilla de firma

```
[Generar planilla]
    │
    ▼
Filtrar por: candidato / supervisor / barrio
    │
    ▼
HTML con @media print
    │ Corte de página por grupo
    │ Cabecera repetida
    │ Optimizada A4
    │
    ├── Contenido por fila:
    │   · Número
    │   · Número de orden
    │   · CI
    │   · Nombre
    │   · Apellido
    │   · Teléfono (cuando corresponda)
    │   · Supervisor
    │   · Candidato
    │   · Barrio
    │   · Vehículo (chapa, marca)
    │   · Estado
    │   · Columna FIRMA (vacía para firmar)
    │
    ▼
[Previsualizar] → [Imprimir] → [Guardar como PDF]
```

Sin Puppeteer. El navegador pagina, repite cabecera y numera.

---

## 5. Lista negra

```
Solicitud ──▶ Revisión ──▶ Alta en lista negra ──▶ Vigente ──┬──▶ Vencida
   │            │                                            └──▶ Revocada
   │            └── rechazada
   └── cualquier rol con `excepciones.solicitar`
```

**Regla crítica:** la lista negra y los antecedentes son conceptos **diferentes**.
Nunca se mezclan.

- Una persona puede: tener antecedente + estar en lista negra + tener excepción
- Nunca eliminar de lista negra para conceder excepción
- La excepción es una entidad **separada**

**Visibilidad:** supervisor/candidato NO ven lista negra ni motivo.
Ven "no habilitado — consultar con coordinación".

---

## 6. Excepciones

```
[Bloqueo detectado]
        ▼
Solicitud  (solicitante, tipo, motivo, evidencia)
        ▼
Estado: pendiente ──▶ notificación a aprobadores
        ▼
┌── aprobada (aprobador ≠ solicitante, con vencimiento)
├── rechazada (con motivo)
└── vencida (automático)
```

Registra: quién autoriza, fecha, motivo, observación, vigencia, estado.

---

## 7. Cupos

**Cascada:** candidato + barrio + supervisor.

```sql
-- dentro de fn_consumir_cupo, en la misma transacción del alta
SELECT limite INTO l FROM cupos WHERE id = p_cupo_id FOR UPDATE;
SELECT COALESCE(SUM(delta),0) INTO usado FROM cupo_movimientos WHERE cupo_id = p_cupo_id;
IF usado + 1 > l AND p_excepcion_id IS NULL THEN
   RAISE EXCEPTION 'CUPO_AGOTADO';
END IF;
INSERT INTO cupo_movimientos(...) VALUES (..., +1, ...);
```

Semáforo: verde < 80%, amarillo 80–99%, rojo = 100%.

---

## 8. Caja

```
Chofer activo
   ▼
[Contrato]         folio · ☑ firmado · fecha · responsable     (monto opcional)
   ▼
[Vale combustible]  folio · ☑ entregado · fecha · responsable   (monto/litros opcionales)
   ▼
[Anticipo]         folio · ☑ pagado · fecha · responsable       (monto opcional)
   ▼  (+ actividad registrada o excepción)
[Pago final]       folio · ☑ finalizado · fecha · autorizado por (monto opcional)
```

**Reglas:**
- Sin contrato firmado → sin vale ni anticipo (RN-06)
- Autorización (admin) ≠ ejecución (tesorería)
- Doble pago imposible (índice único)
- Cada operación registra: usuario, fecha, hora, estado, observación, monto

---

## 9. Importación

```
[Archivo Excel/CSV]  o  [Google Sheet]
        ▼
1. Registro: origen, nombre, sha256, hoja, usuario
        ▼
2. Parseo a `importacion_filas.datos_crudos` (jsonb)
        ▼
3. Normalización → `datos_normalizados`
   · CI: solo dígitos, sin .0 de Excel
   · Teléfono → E.164
   · Catálogos: vía alias_catalogo
        ▼
4. Validación + estado por fila
   ok | rechazada (sin CI) | conflicto
        ▼
5. INFORME PREVIO (no escribe en dominio)
        ▼
6. Resolución humana de conflictos
        ▼
7. fn_confirmar_importacion() ← requiere datos.confirmar_importacion
        ▼
8. Resultado + apariciones_origen
```

**Duplicados:** detectar CI inválida, CI repetida, CI asociada a personas diferentes,
nombre incompatible, candidato incompatible. Los conflictos quedan en staging.
Nunca resolver conflictos automáticamente de forma peligrosa.

**Cada importación registra:** archivo, hash, hoja, fila, fecha, usuario, estado, resultado.

---

## 10. Exportación

12 tipos de reporte. Formatos: XLSX, CSV, PDF.

**Controles:**
1. Registro en `exportaciones` ANTES de entregar archivo
2. CI enmascarado sin `datos.exportar_pii`
3. Rate limiting: 20 exportaciones / 10 min / usuario
4. Registro de acceso sensible si incluye PII

**Exportación completa** (solo ADMIN): `reporte_completo.xlsx` con 12 hojas.

---

## 11. Ficha de persona — secciones

| Sección | Contenido | Estado visual |
|---|---|---|
| Datos personales | CI, nombre, apellido, teléfono | — |
| Padrón | Encontrado/no, local, mesa, orden | 🟢/🟡 |
| Operación actual | Chofer activo o vacío | 🟢/🔵 |
| Antecedentes | Elecciones anteriores, resultado | 🟡 si negativo |
| Lista negra | Vigente o no | 🔴 si vigente |
| Excepciones | Activas, vencidas | 🟢 si aprobada |
| Asignación | Candidato, barrio, supervisor | — |
| Orden | Número de orden | — |
| Vehículo | Chapa, marca, modelo, categoría | — |
| GPS | Dispositivo, actividad, km | 🟢/🟡 |
| Contrato | Folio, firmado, fecha | 🟢/🔵 |
| Combustible | Folio, entregado, fecha | 🟢/🔵 |
| Anticipo | Folio, pagado, fecha | 🟢/🔵 |
| Pago final | Folio, finalizado, fecha | 🟢/🔵 |
| Auditoría | Últimos cambios (si permiso) | — |

**Ubicación original:** cuando proviene de planilla histórica, mostrar archivo, hoja, fila, orden, folio. "Ubicación original en planilla" — esto es trazabilidad.

---

## 12. Cierre del operativo

1. Congelar alta de choferes
2. Recalcular `actividad_diaria` con criterio definitivo
3. Liquidar pagos finales pendientes
4. Cerrar caja y arqueo final
5. Generar `antecedentes` de cada persona desde la elección
6. Revocar scopes y roles operativos → solo lectura
7. Elección pasa a `cerrada`: datos inmutables
