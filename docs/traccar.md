# Integración Traccar (GPS)

Versión 0.1 (propuesta) · 2026-09-12

---

## 1. Por qué esta integración es delicada

El reporte actual del 07/06/2026 clasificó 375 choferes como activos y 320 como inactivos
cruzando **por nombre**. En un maestro con 52 nombres repetidos y 5 homónimos con CI distinto,
eso significa que hay choferes marcados como inactivos que trabajaron y viceversa. Las notas de
evidencia del propio reporte lo admiten: `Eventos: Dispositivo en Movimiento (match: Carlos Martinez)`.

Si de esa clasificación depende un pago, el error es plata.

**Principio de diseño:** el vínculo entre dispositivo y chofer es una clave foránea explícita,
creada y verificada por una persona. Nunca un *match* de texto.

```
personas.ci ──1:1── choferes ──1:0..1── dispositivos_gps ──N── traccar_eventos
                                   │
                                   └── vehiculos (chapa)
```

## 2. Datos que aporta Traccar

| Recurso Traccar | Uso |
|---|---|
| `/api/devices` | Inventario de dispositivos, `id`, `uniqueId`, `name`, `status`, `lastUpdate` |
| `/api/positions` | Posiciones con lat/lng, velocidad, atributos (odómetro, ignición) |
| `/api/reports/events` | Eventos tipificados (movimiento, en línea, ignición, geocerca) |
| `/api/reports/summary` | Resumen por dispositivo y rango: distancia, velocidad media, horas de motor |
| `/api/reports/trips` | Viajes: inicio, fin, distancia, duración |

Para clasificar "trabajó / no trabajó", `reports/summary` y `reports/trips` son más confiables y
más baratos que reconstruir desde posiciones crudas.

## 3. Arquitectura de la integración

```
┌──────────────────┐   cron 5-15 min   ┌──────────────────────┐
│  Vercel Cron     ├──────────────────▶│ Route Handler /api/  │
│  (o Supabase     │                   │   jobs/traccar-sync  │
│   pg_cron)       │                   └──────────┬───────────┘
└──────────────────┘                              │  HTTPS + credenciales
                                                  ▼
                                       ┌──────────────────────┐
                                       │   Servidor Traccar   │
                                       └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │ Supabase (service    │
                                       │ role, server-side)   │
                                       │  traccar_eventos     │
                                       │  dispositivos_gps    │
                                       │  actividad_diaria    │
                                       └──────────────────────┘
```

- El navegador **nunca** habla con Traccar. Sin credenciales en el cliente, sin CORS, sin fuga.
- El job es idempotente: usa `traccar_event_id` (o `dispositivo + timestamp + tipo`) con
  `on conflict do nothing`.
- Ventana incremental: se guarda el último `ocurrido_en` procesado por dispositivo.
- Reintento con backoff; si el job falla 3 veces seguidas, alerta.

## 4. Ciclo de vida de un dispositivo (ABM)

```
pendiente_alta ──▶ activo ──┬──▶ inactivo ──▶ activo
                            └──▶ baja
```

| Paso | Acción |
|---|---|
| 1 | Se registra el dispositivo en Traccar (fuera del sistema) o se importa el inventario |
| 2 | El sistema sincroniza `/api/devices` → `dispositivos_gps` en `pendiente_alta` |
| 3 | Un operador **vincula el dispositivo al chofer** (por CI) y al vehículo → `activo` |
| 4 | El job registra `ultimo_contacto`; sin contacto por N horas → alerta de dispositivo mudo |
| 5 | Al cierre del operativo, baja masiva con registro |

Los campos `ABM Traccar` (529 SI / 22 NO) y `Activado en Traccar` (1 solo valor) de la planilla
actual se reemplazan por este estado, que es derivado y verificable, no declarado a mano.

## 5. Criterio de actividad — explícito y versionado

El campo `actividad_diaria.criterio_version` existe porque "activo" es una definición de negocio
que puede cambiar, y los números viejos tienen que seguir siendo explicables.

**Criterio `v1_movimiento` — confirmado (D-04): sin umbral de kilómetros.**

| Clasificación | Condición |
|---|---|
| `activo` | El dispositivo registró **al menos un evento de movimiento** en la fecha |
| `inactivo` | Dispositivo vinculado, sin ningún evento de movimiento (sólo eventos pasivos) |
| `sin_dispositivo` | Chofer sin dispositivo vinculado — **no es lo mismo que inactivo** |
| `sin_datos` | Dispositivo vinculado que no reportó nada (posible falla del equipo) |

**Los kilómetros se calculan y se muestran, pero no clasifican.** `actividad_diaria.km_recorridos`
es información de la ficha y de los reportes, no una condición de pago. Un chofer que se movió
3 km y otro que hizo 40 son ambos `activo`; la diferencia queda visible para quien mire.

La elección de referencia del histórico es **Internas ANR Municipales — 07/06/2026**, que es el
operativo del que salen los datos de actividad ya existentes.

Distinguir `inactivo` de `sin_dispositivo` y `sin_datos` es importante: hoy los tres caen en la
misma bolsa de 320. Un chofer sin GPS no es un chofer que no trabajó.

**Señales complementarias** a registrar aunque no definan la clasificación: primer y último
evento, cantidad de eventos de movimiento vs. pasivos (`Dispositivo en Línea`,
`Dispositivo en estado Desconocido` — categorías que ya aparecen en el reporte actual), y
presencia dentro de la geocerca del barrio asignado.

**Recálculo.** `fn_recalcular_actividad(eleccion_id, fecha, criterio_version)` reconstruye la
tabla desde los eventos crudos. Cambiar el criterio nunca pisa el resultado anterior: se inserta
una nueva versión y se conserva la previa.

## 6. Geocercas por barrio — fuera de v1 (D-15)

No se cargan polígonos ni se usa PostGIS. El sistema responde "se movió / no se movió" y
"cuántos km", no "estuvo en el barrio que le tocaba".

Queda anotado como la mejora de mayor valor para v2: es la única verificación que distingue a
un chofer que trabajó su zona de uno que simplemente circuló. Agregarla después requiere el
polígono de cada barrio y una columna `geography` en `barrios`; nada del modelo actual lo impide.

## 7. Consideraciones de volumen

Con ~700 dispositivos reportando cada 30 s durante 14 h: ≈ 1,2 millones de posiciones en el día.

- **No** se guardan las posiciones crudas en la base de la aplicación. Se guardan **eventos** y
  el **resumen diario**.
- Si se necesita el recorrido detallado, se consulta a Traccar bajo demanda y se cachea sólo lo
  consultado.
- `traccar_eventos` se particiona por fecha si supera unos pocos millones de filas.
- **Retención indefinida** (D-10): no hay purga automática de eventos ni del resumen. Con
  retención indefinida, el particionado por fecha deja de ser opcional a mediano plazo.

## 8. Fase de preparación (antes de implementar)

- [ ] Confirmar acceso al servidor Traccar: URL, usuario de sólo lectura, token.
- [ ] Relevar el inventario actual de dispositivos y su `uniqueId`.
- [ ] Confirmar el intervalo de reporte configurado en los equipos.
- [x] Criterio de actividad definido: `v1_movimiento`, sin umbral (D-04).
- [x] Geocercas: fuera de v1 (D-15).
- [x] Retención: indefinida (D-10) — se conservan eventos crudos y resumen.
- [ ] **Re-vincular por CI los dispositivos del operativo anterior**, si se quiere recuperar el
      histórico del 07/06/2026 con confiabilidad alta. Mientras no se haga, ese dato queda
      marcado `confiabilidad_dato = 'baja'`.

## 9. Modo degradado

Si Traccar no responde el Día D:

1. El sistema sigue operando; la actividad queda `sin_datos`.
2. Los pagos que dependen de actividad pasan por excepción con evidencia alternativa
   (planilla de presencia firmada por el supervisor).
3. Al restablecerse, se recalcula la actividad y se concilia contra las excepciones otorgadas.
