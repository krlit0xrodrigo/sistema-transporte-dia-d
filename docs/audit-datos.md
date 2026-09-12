# Auditoría de datos y de repositorio

**Fecha:** 2026-09-12 · **Alcance:** repositorio, código previo y archivos fuente disponibles en el proyecto.

---

## 1. Auditoría de repositorio

> **Actualización 2026-09-12:** el padrón electoral fue entregado después de esta auditoría y
> tiene su propio documento: [`audit-padron.md`](audit-padron.md). El módulo de miembros de mesa
> quedó fuera de v1 (D-07), así que los hallazgos de la sección 3.5 sobre esa hoja son
> informativos.

| Ítem | Resultado |
|---|---|
| Repositorio Git en el entorno de trabajo | **No existe.** El directorio de trabajo está vacío de código. |
| Código previo (Next.js, Supabase, scripts) | **No se detectó ninguno.** Sin `package.json`, `supabase/`, `src/`, migraciones ni tests. |
| Estructura de carpetas | Solo existe como **propuesta** en el documento de proyecto "Estructura del Proyecto GitHub". |
| Configuración de CI/CD, linters, entorno | Inexistente. |
| Secretos versionados | No aplica (no hay repositorio). |

**Conclusión:** el proyecto es *greenfield*. No hay deuda técnica de código, pero sí **deuda
técnica de datos** importante (sección 3). No se detectó un remoto de GitHub conectado a este
entorno; si ya existe un repositorio creado, hay que conectarlo antes de la Fase 1.

> ⚠️ La estructura propuesta en el documento del proyecto **omite** `docs/security.md`, que sí
> figura en el pedido. Se agrega, y se agregan también `docs/audit-datos.md` y
> `docs/decisiones-pendientes.md`.

## 2. Archivos fuente detectados

| Archivo | Tamaño | Hojas | Rol detectado |
|---|---|---|---|
| `Logistica Dia D Dr Lopez Intendente 2.xlsx` | 1,98 MB | 27 | **Maestro operativo**. Padrón interno de choferes + planillas por barrio + miembros de mesa. |
| `Reporte_Choferes_07062026 1.xlsx` | 60 KB | 5 | **Reporte derivado** del cruce con GPS al 07/06/2026 + cupos por referente + preferenciales por candidato. |

No se detectaron CSV ni exportaciones de Google Sheets.

### 2.1 Mapa de hojas — `Logistica Dia D`

| Hoja | Filas con dato | Contenido |
|---|---|---|
| `Choferes` | **695** | Maestro. 21 columnas de negocio. **Fuente de verdad actual.** |
| `COPIA` | 1.133 | Copia del maestro **con 551 filas duplicadas exactas** y 8 CI que ya no están en `Choferes`. |
| `SIN GPS` | 2 | Vacía en la práctica (solo encabezado + 1 fila parcial). |
| `Miembros de Mesa` | 130 | Padrón de miembros de mesa y veedores. Esquema distinto. |
| `escandriolo`, `Copia de escandriolo`, `copias` | 14 / 44 / 44 | Planillas impresas por concejal (Irala, Tutu Gimenez). Contienen filas repetidas dentro de la misma hoja. |
| `BARRIO LA ESPERANZA TAKA` | 6 | Planilla impresa (Concejal Estrella). |
| `VN - <17 barrios>` | 3 a 31 c/u | Planillas impresas por barrio del Concejal Venus Nuñez. |
| `Hoja 28` | 0 | Vacía. |

Las 21 hojas de planilla comparten el **mismo formato de impresión**: título en la fila 15,
encabezado en la 16, datos desde la 17. Son *vistas para firmar en papel*, no fuentes de datos.
En el sistema deben reemplazarse por **una exportación PDF/Excel generada desde la base**,
no por 21 hojas mantenidas a mano.

### 2.2 Mapa de hojas — `Reporte_Choferes`

| Hoja | Filas | Contenido |
|---|---|---|
| `RESUMEN` | — | Totales y desglose por candidato al 07/06/2026 |
| `ACTIVOS` | 375 | Choferes con evidencia GPS de movimiento |
| `INACTIVOS` | 298 | Choferes sin evidencia |
| `Hoja 1` | 40 + total | **Cupos/montos por referente** (total 2.136) |
| `Hoja 2` | 3 bloques | **Preferenciales por candidato** (3 listas distintas) |

---

## 3. Análisis de estructura del maestro `Choferes`

21 columnas: `Nro De item`, `Nro de Orden`, `CI del Chofer`, `Nombre del Chofer`,
`Apellido del Chofer`, `Nro de Cel del Chofer`, `Categoria`, `Marca`, `Modelo`, `Chapa`,
`Candidato`, `Barrio Asignado`, `Supervisor`, `Estado de Servicio`, `Vota en Villa Hayes`,
`ABM Traccar`, `Activado en Traccar`, `Contrato Firmado`, `Cobro Combustible`, `Cobro Viatico`,
`Link del Contrato`. (+2 columnas sin nombre con datos sueltos.)

### 3.1 Completitud (sobre 695 filas)

| Campo | Llenos | % | Lectura |
|---|---:|---:|---|
| Candidato | 685 | 99 % | 10 choferes sin candidato |
| CI del Chofer | 675 | 97 % | **20 choferes sin CI** |
| Nombre / Apellido | 677 / 674 | 97 % | 18–21 registros sin nombre |
| Estado de Servicio | 639 | 92 % | 56 sin definir contratado/voluntario |
| Nro de Celular | 609 | 88 % | 86 sin contacto |
| ABM Traccar | 551 | 79 % | |
| Vota en Villa Hayes | 541 | 78 % | 154 sin verificar |
| Categoría de vehículo | 528 | 76 % | |
| Chapa | 416 | 60 % | **279 vehículos sin patente** |
| Barrio Asignado | 393 | 57 % | **302 choferes sin barrio** |
| Supervisor | 369 | 53 % | **326 choferes sin supervisor** |
| Link del Contrato | 3 | 0,4 % | |
| Activado en Traccar | 1 | 0,1 % | Columna prácticamente sin usar |
| **Contrato Firmado** | **0** | **0 %** | Columna vacía |
| **Cobro Combustible** | **0** | **0 %** | Columna vacía |
| **Cobro Viatico** | **0** | **0 %** | Columna vacía |

> **Hallazgo crítico:** las tres columnas que controlan **dinero y contrato** están 100 % vacías.
> Es decir: *hoy no existe registro digital de quién firmó, quién retiró combustible y quién
> cobró*. Todo ese control vive en papel. Esto es lo que más valor agrega al digitalizar y es
> también el mayor riesgo actual de fraude o doble pago.

### 3.2 Duplicados detectados

| Tipo | Cantidad | Detalle |
|---|---:|---|
| **CI duplicados** | **64 CI distintos, 134 filas** | Hasta 3 apariciones del mismo CI |
| Nombres repetidos | 52 nombres, 107 filas | |
| Nombres con más de un CI | 5 | `BERNARDO GONZALEZ`, `CESAR MARTINEZ`, `CIPRIANO PERALTA`, `JUAN NUÑEZ`, `OSCAR AGUERO` — homónimos reales, **no** deduplicar por nombre |
| Duplicados exactos en `COPIA` | 551 filas | |
| Chapas repetidas | 9 patentes | Una chapa en 3 registros distintos |

Patrón típico del duplicado por CI (caso real, CI `4485876`):

| Fila | Nombre | Candidato | Barrio |
|---|---|---|---|
| 32 | Daniel Britez | Concejal Venus Nuñez | Barrio Alonso |
| 382 | Daniel Britez | Concejal **Negro** Nuñez | — |
| 602 | DANIEL BRITEZ (mayúsculas) | Concejal Negro Nuñez | — |

Esto no es solo suciedad de datos: es **un mismo chofer imputado a dos candidatos distintos**,
con impacto directo en cupos y en pagos. De los 64 CI duplicados, buena parte cruza candidatos.

### 3.3 Inconsistencias de formato y de dominio

- **CI:** 658 de 7 dígitos, 17 de 6 dígitos. Sin dígito verificador ni formato uniforme.
  Vienen como número flotante desde Excel (`4349952.0`), con riesgo de pérdida de ceros a la izquierda.
- **Teléfonos:** 6 formatos conviviendo — 527 con 10 dígitos (`0992511770`), 72 con prefijo país
  (`595982387660`), 4 con 9, y **4 valores truncados inservibles** (`0975`, `0971`, `098`, `0972218`).
- **Nombres:** mezcla de mayúsculas/minúsculas, espacios finales, nombre y apellido a veces
  invertidos o en la misma celda.
- **Barrios:** 23 valores de texto libre, con variantes del mismo barrio entre hojas
  (`Barrio el Ñiño` / `VN - NIÑO`, `Barrio Pañete` / `VN - BARRIO PAÑETE`,
  `Barrio Maria Auxiliadora` cuya planilla se titula `BARRIO SAN JUAN`). **No hay catálogo de barrios.**
- **Supervisores:** 22 valores de texto libre, incluyendo un apodo sin apellido (`Jucecen`).
  Un supervisor (`Mario Valdez`) coincide con el nombre de un candidato → ambigüedad de entidad.
- **Candidatos:** 17 valores con prefijo `Concejal ` embebido en el nombre; en `Hoja 2` los
  mismos candidatos aparecen **sin** el prefijo y con apodos distintos
  (`Dr. Ariel Escandriolo Doctorcito` vs `Concejal Ariel Escandriolo`). **No hay clave estable de candidato.**
- **Booleanos:** `SI`/`NO` como texto, con espacios (`'SI '`), y ausencia interpretada a veces
  como "no" y a veces como "sin datos". Ambigüedad real en `Vota en Villa Hayes` (154 nulos).
- **Vehículo dentro de chofer:** `Marca`, `Modelo`, `Chapa`, `Categoria` viven en la fila del
  chofer. Un chofer con dos vehículos o un vehículo con dos choferes no es representable.

### 3.4 Inconsistencias entre archivos

| Verificación | Resultado |
|---|---|
| `RESUMEN` declara 695 totales / 375 activos / **320 inactivos** | La hoja `INACTIVOS` tiene **298 filas**. **Faltan 22 registros.** 375 + 298 = 673 ≠ 695. |
| `RESUMEN` declara 300 "sin ningún registro GPS" | La hoja `INACTIVOS` tiene 278 filas con esa nota. **Diferencia de 22**, coherente con el faltante anterior. |
| Cruce por nombre maestro ↔ reporte | 617 nombres coinciden; **5 nombres del maestro no aparecen en el reporte** (`YENI`, `ANGEL GABRIEL`, `REINALDO`, `CARLOS ESTIGARRAGA`, `JORGE AVALOS`) — son registros incompletos, sin apellido. |
| El reporte **no trae CI** | El cruce GPS↔chofer se hizo **por nombre**, no por CI. Con 52 nombres repetidos y 5 homónimos con CI distinto, **el reporte tiene asignaciones de actividad potencialmente erróneas**. |
| Notas de evidencia | Texto libre tipo `Eventos: Dispositivo en Movimiento (match: Carlos Martinez)` — el propio dato admite que hubo un *match* difuso por nombre. |
| Superposición choferes ↔ miembros de mesa | 3 CI figuran en ambas listas. Es un conflicto operativo real: un miembro de mesa no puede estar manejando. |

### 3.5 Otros hallazgos

- `Hoja 1` del reporte lista 40 referentes con un número (total **2.136**) y **18 de ellos en 0**.
  Los nombres mezclan persona, persona+candidato (`Rafa Moreno - Negro Nuñez`) y persona+barrio
  (`Raquel Olmedo - San Juan Bautista`, que aparece 3 veces con barrios distintos).
  Es la mejor aproximación existente a **cupos**, pero la clave está compuesta a mano.
- `Hoja 2` contiene **3 listas de preferenciales distintas** apiladas en la misma hoja sin
  separador formal. Aparecen candidatos que **no existen** en el maestro (`Lidia Evers`,
  `Gloria Alvarenga`, `Lucio Bogado`, `Gabi Pereira`, `Toñy Ortiz`, `Carina Martini`,
  `Dra. Catthy Rivas`), lo que sugiere que el maestro cubre solo parte de la estructura.
- `Miembros de Mesa`: 130 registros, 128 con CI, **sin duplicados de CI** (mejor calidad que
  choferes), 121 de 130 sin función electoral definida, columna `Esta Afiliado` con un único
  valor (`SI `) → no discrimina. Campos de resumen (`Cantidad de Mesas`, etc.) mezclados en
  la misma grilla que los datos → hoja con dos tablas superpuestas.

---

## 4. Riesgos derivados de los datos

| # | Riesgo | Severidad | Origen |
|---|---|---|---|
| R1 | **Doble pago / pago cruzado** por CI duplicado entre candidatos | Crítico | 64 CI duplicados |
| R2 | **Sin trazabilidad de contrato ni de caja** | Crítico | 3 columnas 100 % vacías |
| R3 | Reporte de actividad GPS **cruzado por nombre** → activos/inactivos mal atribuidos | Alto | Reporte sin CI |
| R4 | Descuadre de totales entre reporte y maestro (22 registros) | Alto | Sección 3.4 |
| R5 | 302 choferes sin barrio y 326 sin supervisor → **sin cadena de responsabilidad** | Alto | Completitud |
| R6 | 20 choferes sin CI → no identificables, no auditables | Alto | Completitud |
| R7 | 279 vehículos sin chapa → imposible verificar el vehículo declarado | Medio | Completitud |
| R8 | Barrios/supervisores/candidatos como texto libre → métricas no confiables | Medio | Sin catálogos |
| R9 | Teléfonos inválidos → 4 choferes inubicables, 86 sin contacto | Medio | Formato |
| R10 | Choferes que también son miembros de mesa | Medio | 3 CI |
| R11 | Copias divergentes del maestro (`COPIA`, `escandriolo`, `copias`) circulando | Medio | Hojas duplicadas |

---

## 5. Recomendación de tratamiento

1. **El maestro `Choferes` (695 filas) es la única fuente a importar.** `COPIA` y las 21
   planillas se descartan como fuente; se conservan como evidencia histórica.
2. La importación entra a **staging obligatorio** con un informe de: filas sin CI, CI
   duplicados, valores no mapeables a catálogo.
3. Los **64 CI duplicados requieren resolución humana** antes del commit. No se resuelven
   automáticamente: hay que decidir a qué candidato queda imputado cada chofer.
4. Los **20 registros sin CI** se **rechazan** en la importación (D-18). No se crea persona ni
   registro parcial; el importador los informa como filas rechazadas.
5. Se construyen catálogos de `barrios`, `supervisores` y `candidatos` **antes** del import,
   con tabla de alias para mapear las variantes de texto.
6. El reporte GPS histórico se importa **como antecedente etiquetado "cruce por nombre —
   confiabilidad baja"**, nunca como verdad para decidir pagos retroactivos.
