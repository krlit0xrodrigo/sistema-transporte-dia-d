# ROADMAP

Versión 0.3 — **calendario real** · 2026-09-12
**Día D: domingo 4 de octubre de 2026.** Quedan **21 días de trabajo** (12 sep – 3 oct).

---

## 1. Lo primero: el plan anterior ya no sirve

La v0.2 proponía 9 fases sin fecha. Con 21 días, ese plan es ficción. No alcanza para construir
el sistema completo y decir lo contrario sería el peor servicio que te puedo hacer a tres
semanas de un operativo.

Lo que sí alcanza es un **MVP que resuelve los tres problemas que rompieron el operativo
anterior**: choferes duplicados, cero registro de contratos y pagos, y planillas hechas a mano.
Todo lo demás se construye después del 4 de octubre, con el sistema ya probado en fuego real.

**La regla que ordena estas tres semanas:** el 2 de octubre tiene que existir el paquete completo
de planillas en papel, exportado desde el sistema. Si algo falla el Día D, el operativo funciona
igual. Esa salida no se negocia ni se posterga: es lo que convierte un riesgo de proyecto en un
inconveniente.

## 2. Qué entra y qué no

### MVP — 4 de octubre

| # | Alcance | Por qué es imprescindible |
|---|---|---|
| 1 | Alta y consulta de choferes, sin duplicados, verificados contra padrón | Sin esto no hay sistema |
| 2 | Importación de los 695 + padrón (35.192) | Es el dato con el que se trabaja |
| 3 | Asignación candidato / barrio / supervisor + cupos en cascada | El control de quién responde por quién |
| 4 | Marcas de caja: contrato firmado, vale, anticipo, pago final, con folio | Lo que hoy no existe en ningún lado |
| 5 | Exportación de planillas por barrio y candidato (PDF/XLSX) | Reemplaza las 21 hojas a mano y **es el plan B en papel** |
| 6 | Roles, RLS y bitácora de auditoría | No se agrega después: se diseña adentro |
| 7 | Lista negra mínima: marcar y bloquear | Barato de hacer, caro de no tener |

### Después del 4 de octubre

Excepciones con flujo de aprobación completo · clasificación automática de actividad GPS ·
montos, libro de caja y arqueo · panel de auditoría con pantallas · pantallas de gestión
multi-organización · reportes avanzados · geocercas (v2).

> **`organizacion_id` va en las tablas desde la primera migración** aunque no haya pantallas para
> gestionarlo. La columna es gratis ahora y cuesta 45 migraciones después.

### GPS: qué se hace y qué no

El Día D **no** se necesita clasificación automática de actividad — eso se verifica al día
siguiente. En estas tres semanas alcanza con: registrar los dispositivos vinculados por CI y
dejar el job de ingesta corriendo, guardando eventos. La clasificación `activo/inactivo` y los
km se calculan el 5 de octubre, cuando ya no hay presión. Lo que **sí** hay que asegurar antes
es la vinculación dispositivo ↔ chofer por cédula: si eso no está hecho el 3 de octubre, se
repite el cruce por nombre del operativo anterior y los datos no sirven para decidir pagos.

---

## 3. Calendario

### Semana 1 — sáb 12 a vie 18 de septiembre · Fundaciones y datos adentro

| Día | Entregable |
|---|---|
| 12–13 | Repo en GitHub, Next.js + TS + Tailwind + shadcn, proyectos Supabase (local/preview/prod), despliegue vacío en Vercel |
| 13–14 | Migraciones base: `organizaciones`, `elecciones`, catálogos (barrios, 7 locales, candidatos, supervisores, `alias_catalogo`), usuarios/roles/permisos/scopes, trigger de `audit_log` |
| 14–15 | Auth con MFA, middleware de sesión, layout, los 9 roles entrando y viendo lo suyo |
| 15–16 | **Importación del padrón** (35.192 + participación) 🔴 *requiere el CSV re-exportado en UTF-8* |
| 16–18 | `personas`, `choferes`, `asignaciones`, `vehiculos`, `apariciones_origen` + importador con staging |
| 18 | **Importación de los 695 choferes** y sesión de resolución de los 64 CI duplicados |

**Salida de la semana:** la base tiene el padrón y los choferes reales, sin duplicados, con cada
aparición archivada. Si esto no está el viernes 18, hay que recortar el alcance del MVP, no
correr más rápido.

🔴 **Bloqueante del lunes 14:** el padrón re-exportado en UTF-8. El archivo actual tiene 2.031
apellidos con la Ñ perdida y no se repara por conversión. **Es lo primero que hay que pedir.**

### Semana 2 — sáb 19 a vie 25 de septiembre · Operación

| Día | Entregable |
|---|---|
| 19–20 | Pantalla de alta de chofer con la cadena completa de validaciones (CI, padrón, lista negra, duplicado) |
| 20–21 | Búsqueda por CI y por nombre, ficha del chofer con apariciones de origen y datos de padrón |
| 21–22 | Cupos en cascada + `fn_consumir_cupo_cascada` con bloqueo transaccional + tablero con semáforo |
| 22–23 | Lista negra mínima (marcar, bloquear, revocar con motivo) |
| 23–25 | Folios + marcas de caja: contrato firmado, vale entregado, anticipo pagado, pago finalizado |

**Salida de la semana:** un operador puede dar de alta, asignar y registrar caja de punta a
punta. Test de concurrencia: 50 altas simultáneas contra el mismo cupo, cero sobre-cupo.

### Semana 3 — sáb 26 de septiembre a vie 2 de octubre · Salidas y ensayo

| Día | Entregable |
|---|---|
| 26–27 | **Exportación de planillas por barrio y candidato (PDF y XLSX)** — la salida más importante |
| 27–28 | Reportes: resumen del operativo, por candidato, control de folios |
| 28–29 | Vinculación de dispositivos Traccar por CI + job de ingesta guardando eventos |
| 29–30 | Endurecimiento: cabeceras, rate limiting en Cloudflare, revisión de RLS, test de aislamiento entre organizaciones, escaneo de secretos |
| 30 sep–1 oct | **Simulacro completo con el equipo real**, datos reales, en preview |
| 1–2 oct | Corrección de lo que rompió el simulacro. Capacitación de supervisores y tesorería |
| **2 oct** | 🟢 **Paquete completo de planillas en papel exportado y entregado** |

**Salida de la semana:** el equipo ya usó el sistema una vez antes del día que importa, y el
papel está impreso por si acaso.

### Sábado 3 de octubre — Congelamiento

- Se congela el código. Nada se despliega salvo un fallo que impida operar.
- Backup completo + verificación de restauración.
- Modo solo lectura probado (el interruptor, no la teoría).
- Verificación final: todos los dispositivos GPS vinculados por CI.
- Alertas activas y alguien de guardia con acceso.

### Domingo 4 de octubre — Día D

- Backup horario durante las 48 h.
- Soporte dedicado, con el plan de contingencia en papel a mano.
- Job de Traccar cada 5 minutos, sólo ingiriendo.
- Nadie toca el esquema.

### Lunes 5 en adelante — Cierre y continuación

Cálculo de actividad y km · liquidación de pagos finales · generación de antecedentes ·
retrospectiva · y recién ahí, todo lo diferido de la sección 2.

---

## 4. Riesgos de este calendario

| Riesgo | Señal temprana | Qué hacer |
|---|---|---|
| **El padrón no llega en UTF-8 a tiempo** | No está el lunes 14 | Importar sin los 2.031 apellidos con Ñ y corregirlos después. Peor, pero no bloquea |
| Los 64 duplicados no se resuelven el 18 | La sesión de resolución se posterga | Es una decisión política (D-03), no técnica: si no hay quien decida, el sistema arranca con esos 64 en estado bloqueado |
| Se llega al 26 sin caja funcionando | Fin de semana 2 sin la pantalla de marcas | Se recorta: caja queda en papel este operativo, el resto del sistema sigue |
| El simulacro del 30 sale mal | — | Es exactamente para eso. Hay 3 días de margen; por eso está el 30 y no el 3 |
| Alcance que crece | Cualquier "ya que estamos" | Todo pedido nuevo va a la lista de post-4-de-octubre. Sin excepción |

**El riesgo mayor no es técnico:** son 21 días para un sistema que registra pagos. Si algo se
atrasa, lo que se recorta es alcance, nunca las pruebas ni el respaldo en papel.

## 5. Si hay que recortar, en este orden

1. **Identidad sin duplicados + padrón** — sin esto, todo lo demás miente.
2. **Exportación de planillas** — es el entregable que reemplaza el trabajo manual y es el plan B.
3. **Cupos y asignación** — el control de quién responde por quién.
4. **Marcas de caja y folios** — lo que hoy no existe.
5. **Lista negra** — barato, alto valor.
6. GPS — se puede resolver con los eventos crudos después del operativo.
7. Reportes avanzados — se exporta a Excel y se arma a mano una vez más.
