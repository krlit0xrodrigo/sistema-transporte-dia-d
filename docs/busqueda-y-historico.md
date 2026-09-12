# Búsqueda, histórico y operación actual

Versión 1.0 — 2026-09-12

Dos decisiones que cambian cómo se usa el sistema todos los días. Van juntas porque
comparten la misma causa: **una persona no es lo mismo que su participación en una elección.**

---

## 1. El histórico del 07/06/2026 no es el operativo del 04/10/2026

### Qué estaba mal

El importador de choferes resolvía la elección así:

```sql
select id from elecciones where organizacion_id = %s and estado = 'activa'
```

La única elección activa es **Día D — Municipales Villa Hayes (04/10/2026)**. Las planillas
que se importaron son de la **interna del 07/06/2026**. Resultado: 599 participaciones
históricas quedaron cargadas como choferes del operativo actual, y el listado abría con 599
nombres que nadie había dado de alta.

Un listado que arranca lleno de gente que nadie cargó es un listado en el que no se puede
confiar. Y peor: esconde el dato que importa, que es **quién sí está confirmado para el
4 de octubre**.

### Cómo se separan ahora

| | Operación actual | Histórico |
|---|---|---|
| Elección | Día D — 04/10/2026 | Interna — 07/06/2026 |
| `origen_planilla_id` | **nulo** (alta desde la aplicación) | **lleno** (vino de una planilla) |
| Dónde se ve | `/choferes`, pestaña «Operación actual» | `/choferes`, pestaña «Histórico», y en la ficha de cada persona |
| Cómo se consulta | Se lista entero (empieza vacío y crece de a uno) | **Se busca**, no se lista |
| Entra en la planilla impresa | Sí | No |
| Entra en caja, cupos y reportes | Sí | No |

Las dos condiciones son independientes y las dos se aplican: la elección **y** el origen. Un
alta hecha desde la aplicación en una elección vieja tampoco es operación actual.

### Qué NO se borró

Nada. La migración `0007` sólo cambia `eleccion_id`: mueve las participaciones importadas, sus
asignaciones, sus apariciones de origen y sus dispositivos a la elección interna a la que
siempre pertenecieron. Personas, vehículos, antecedentes y padrón quedan intactos, y el trigger
`tg_audit_choferes` deja en `audit_log` el `eleccion_id` anterior de cada fila, así que la
reversión es reconstruible. El archivo trae el UPDATE inverso comentado al final.

Los catálogos —candidatos, barrios, supervisores— **no se mueven**: los mismos concejales y los
mismos 22 supervisores trabajan en las dos elecciones, y el operativo actual los necesita.

### Guardas que abortan la migración

Sin escribir nada, si encuentra:

- **Documentos de caja emitidos** sobre un chofer importado. Mover la participación dejaría el
  contrato con folio en la elección equivocada, y eso se decide a mano.
- **Consumo de cupo** registrado sobre un chofer importado, que descuadraría el tablero.

### Para que no se repita

`scripts/import/choferes.py` acepta ahora `--eleccion AAAA-MM-DD`. Sin ese argumento sigue
usando la elección activa, pero **avisa fuerte y nombra la elección destino antes de escribir**.

---

## 2. Búsqueda

### Cédula — normalizada, con puntos o sin puntos

`4.361.034` y `4361034` son la misma cédula. Antes de consultar se quita todo lo que no sea
dígito, el `.0` que deja Excel y los ceros a la izquierda. Es exactamente lo que hace
`fn_normalizar_ci` en PostgreSQL: la misma regla escrita dos veces, una para el navegador y
otra para la transacción, porque nunca pueden discrepar sobre qué cédula es cuál.

El autocompletado busca **por prefijo**: escribir `436` empieza a mostrar coincidencias.
El índice `ix_personas_ci_prefijo` usa `text_pattern_ops`, porque con la colación por defecto
de Supabase un btree común **no** resuelve `like '436%'`.

### Nombre y apellido — coincidencia exacta

Exacta, **sensible a mayúsculas y a acentos**:

- `José` **no** es `Jose`
- `GAMARRA` **no** es `Gamarra`
- Buscar `Carlos` encuentra a quienes se llaman exactamente Carlos, **no** a los cuarenta que
  llevan «Carlos» en algún lugar del nombre completo

Los nombres se guardan capitalizados (`Daniel Britez`), así que escribir el nombre como se
escribe funciona. La búsqueda es sobre las columnas `nombres` y `apellidos` por separado, no
sobre `nombre_completo`.

**La búsqueda parcial existe pero se enciende a mano.** Cuando la exacta no devuelve nada, la
pantalla dice cuántas habría con coincidencia parcial y ofrece un botón para pasarse. Nunca se
mezclan los dos comportamientos ni se cae en el parcial por su cuenta.

### Nada se consulta hasta que hay algo que buscar

`/choferes` ya no trae cien filas al abrirse. Sin término escrito no hay consulta y no hay
filas: un estado vacío que dice qué escribir.

### Qué la hace rápida

| | |
|---|---|
| **Debounce de 300 ms** | Escribir `4361034` son siete pulsaciones. Antes eran siete consultas; ahora es una |
| **Cancelación** | Cada búsqueda aborta la anterior con `AbortController`. Sin esto, una respuesta lenta llega después de una rápida y pinta resultados viejos encima de los nuevos |
| **Del lado del servidor** | El navegador recibe 15 filas, nunca la tabla. La consulta corre con el JWT del usuario, así que RLS filtra: un supervisor autocompleta con su gente |
| **Acotada** | Máximo 15 resultados en el autocompletado, 50 en el listado. Tres consultas por búsqueda, todas con índice |
| **Sin caché** | `Cache-Control: no-store`. Un chofer dado de alta hace diez segundos aparece en la siguiente tecla |

### Cuando la cédula no existe

El resultado vacío ofrece **dar de alta esa cédula**, y el formulario abre con la cédula ya
cargada. El operador no la vuelve a tipear ni se equivoca al copiarla.

---

## 3. Rol `consulta`

Ya existía en el catálogo. Se le agregaron dos permisos de **lectura** (`personas.ver` y
`choferes.ver_pii`) porque sin ellos no llegaba a leer una ficha, que es justamente para lo
que existe.

Puede: buscar por cédula, nombre y apellido, usar el autocompletado, abrir la ficha y ver
asignación, vehículo, candidato, supervisor, número de orden y antecedentes.

No puede, **y no por la interfaz sino porque RLS lo rechaza**: crear, editar o dar de baja
choferes; asignar o reasignar; tocar caja, contratos o pagos; ver o gestionar la lista negra;
definir cupos; exportar; consultar el padrón; administrar usuarios, roles o catálogos.

La migración `0009` verifica las dos mitades: que el rol llegue a leer una ficha, y que no
tenga **ningún** permiso de escritura. Si alguien le agrega uno, la migración falla.
