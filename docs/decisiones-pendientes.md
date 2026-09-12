# Decisiones

Actualizado 2026-09-12. **Las 21 decisiones están resueltas. Ninguna bloquea el desarrollo.**

> **Día D: domingo 4 de octubre de 2026 — 21 días de trabajo.** Ver `ROADMAP.md`.

---

## Decisiones resueltas

| ID | Decisión | Resolución | Impacto aplicado |
|---|---|---|---|
| **D-01** | Padrón electoral | ✅ Entregado — 35.192 registros, cédula única, 7 locales. Ver `docs/audit-padron.md` | `padron_snapshots`, `padron_electoral`, `padron_participacion`, `locales_votacion` con datos reales. ⚠️ **Falta re-exportar en UTF-8** |
| **D-02** | Repositorio | ✅ `github.com/krlit0xrodrigo/sistema-transporte-dia-d`, rama `main` | Repo inicializado con remoto y primer commit |
| **D-03** | 64 CI duplicados | ✅ Una participación activa + historial de apariciones visible | Tabla `apariciones_origen`; la ficha muestra todas las veces que el CI figuró |
| **D-04** | Criterio de chofer activo | ✅ Sin umbral de km. Activo = hubo movimiento; los km se muestran | `criterio_version = 'v1_movimiento'`. Referencia: Internas ANR Municipales 07/06/2026 |
| **D-05** | Estructura de cupos | ✅ Los tres en cascada: candidato + barrio + supervisor | `fn_consumir_cupo_cascada` valida los tres |
| **D-06** | Lista negra: motivos y vigencia | ✅ **Catálogo aprobado. Vigencia por defecto indefinida, revocable con motivo** | Enum `motivo_lista_negra` con 8 valores (abajo) |
| **D-07** | Miembros de mesa | ✅ Fuera de v1 | Tabla eliminada del modelo |
| **D-08** | Acceso de candidatos | ✅ Sí, sólo lo suyo | Rol `candidato` con scope propio |
| **D-09** | Firma de contrato | ✅ Sólo marca de firmado | `firmado`, `fecha_firma`, `registrado_por`. Sin PDF |
| **D-10** | Retención | ✅ Indefinida | Sin purga automática |
| **D-11** | Tamaño del equipo | ✅ **≥ 3 personas** | **La matriz de separación de funciones se mantiene tal cual**: solicitar ≠ aprobar, autorizar ≠ marcar pago |
| **D-12** | Multi-organización | ✅ Sí | `organizaciones` + `organizacion_id` en las 45 tablas, con RLS |
| **D-13** | Base legal | ✅ Autorizado a avanzar; confirmación legal antes de producción | Compuerta del 3 de octubre, no del desarrollo |
| **D-14** | Responsabilidad | ✅ **Cada supervisor o concejal responde por los choferes que declara** | Nueva regla RN-16 + campo `declarado_por` en `choferes`. Ver nota abajo |
| **D-15** | Geocercas | ✅ No en v1 | Sin PostGIS |
| **D-16** | Montos y caja | ✅ Estados + montos opcionales | Marcas con fecha y responsable; `monto` nulo permitido; arqueo disponible |
| **D-17** | Un chofer, ¿un candidato? | ✅ Uno solo | Índice único parcial sobre asignación vigente |
| **D-18** | 20 choferes sin CI | ✅ Se descartan | CI obligatorio; el importador los rechaza |
| **D-19** | Google Sheets | ✅ Sólo import inicial | Sin sincronización continua |
| **D-20** | Fecha del Día D | ✅ **Domingo 4 de octubre de 2026** | **`ROADMAP.md` reescrito: 21 días, MVP acotado** |
| **D-21** | 70 choferes fuera del padrón | ✅ **Se aceptan, marcados `fuera_de_padron`** | `personas.estado_identidad = 'fuera_de_padron'`; no bloquea el alta ni el pago |
| — | Padrón: afiliación y participación | ✅ Se importan sin restricción especial de acceso | Visibles con `padron.consultar`. Nota de diseño en `docs/security.md` §6.1 |

---

## D-06 · Catálogo de motivos de lista negra (aprobado)

```sql
create type motivo_lista_negra as enum (
  'incumplio_operativo',      -- no se presentó o abandonó el servicio
  'cobro_sin_servicio',       -- cobró sin prestar el servicio
  'documentacion_falsa',      -- documentación adulterada o falsa
  'vehiculo_no_habilitado',   -- vehículo inexistente, inhabilitado o no coincidente
  'conducta',                 -- conducta durante el operativo
  'doble_imputacion',         -- figuró con más de un candidato
  'a_pedido_de_la_persona',   -- la propia persona pidió no participar
  'otro'                      -- requiere motivo_detalle obligatorio
);
```

**Vigencia por defecto: indefinida** (`vigente_hasta is null`), coherente con D-10.
Se levanta sólo por revocación explícita, con motivo y responsable, y la entrada original nunca
se borra. `motivo_detalle` es obligatorio cuando el código es `otro`.

## D-14 · Responsabilidad declarativa

La respuesta define algo más valioso que un cargo: **cada chofer tiene un responsable nombrado**
—el supervisor o concejal que lo declaró— y eso se guarda en el registro, no en la memoria de
alguien.

**Aplicado como:**
- `choferes.declarado_por` (FK a `usuarios`) y `choferes.responsable_persona_id`
  (el supervisor o candidato que responde por él), ambos obligatorios en el alta.
- **RN-16:** todo chofer tiene un responsable declarado identificable. Un alta sin responsable
  se rechaza.
- Reporte "choferes por responsable", que es la pregunta que se hace cuando algo sale mal.

**Lo que esto todavía no cubre:** quién responde por la seguridad del *sistema* —rotar claves,
revisar accesos, actuar ante un incidente—. Eso es un rol distinto del responsable de cada
chofer. **Por defecto queda en el responsable del proyecto** hasta que se designe a otra
persona; no bloquea nada, pero conviene que sea un nombre y no un supuesto.

---

## Registro de cambios

| Fecha | Cambio |
|---|---|
| 2026-09-12 | Versión inicial con 20 decisiones abiertas |
| 2026-09-12 | 16 resueltas. Alta de D-21 tras la auditoría del padrón |
| 2026-09-12 | **Las 5 restantes resueltas. Fecha del Día D confirmada (4 oct) → roadmap reescrito a 21 días** |
