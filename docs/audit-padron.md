# Auditoría del padrón electoral de Villa Hayes

**Archivo:** `padron_vh_rows.csv` · 4,8 MB · **35.192 registros** · recibido 2026-09-12
Resuelve **D-01**.

---

## 1. Estructura

| Columna | Completitud | Distintos | Observación |
|---|---:|---:|---|
| `cedula` | 100 % | **35.192** | **Sin un solo duplicado.** 33.240 de 7 dígitos, 1.940 de 6, 12 de 5 |
| `cedula_formateada` | 100 % | 35.192 | Con puntos (`32.713`) — redundante, se descarta al importar |
| `nombre` | 100 % | 35.070 | Formato `APELLIDOS, NOMBRES` (122 homónimos exactos) |
| `local` / `local_nombre` | 100 % | 7 | 7 locales de votación |
| `zona` | 100 % | 2 | `0 VILLA HAYES` (29.502) · `6 POZO COLORADO` (5.690) |
| `mesa` | 100 % | 20 | 1 a 20 |
| `orden` | 100 % | 440 | Orden dentro de la mesa |
| `direccion` | 93,6 % | 14.909 | 2.270 sin dirección |
| `partidos` | 100 % | 363 | Afiliación partidaria (puede ser múltiple) |
| `seccional` | 60,2 % | 54 | |
| `jun2021` `oct2021` `dic2022` `abr2023` `jun2026` | 47–60 % | 2 | **Participación por elección** (`S`/`N`) |

**Calidad general: muy buena.** Es, por lejos, la fuente más limpia del proyecto: cédula única,
sin nulos en los campos estructurales, catálogos cerrados.

### Locales de votación

| Código | Local | Electores |
|---:|---|---:|
| 4 | COL. NAC. DR. BLAS GARAY | 6.809 |
| 3 | ESC. DEFENSORES DEL CHACO | 6.424 |
| 501 | ESC. DE REMANSITO | 6.110 |
| 509 | ESC. N° 1152 GRAL. PATRICIO COLMAN | 5.690 |
| 1 | LIC. NAC. DEFENSORES DEL CHACO | 3.906 |
| 2 | ESC. N° 125 PTE. HAYES (RUTHERFORD B. HAYES) | 3.575 |
| 504 | ESC. N° 5925 DON JORGE GAYOSO | 2.678 |

Estos 7 locales alimentan el catálogo `locales_votacion` y confirman los 4 que aparecían
sueltos en la hoja de miembros de mesa.

## 2. Problema a corregir antes de importar

🔴 **El archivo está mal codificado.** Contiene **23.114 caracteres de reemplazo** (`�`) donde
deberían ir `Ñ` y `°`: `NU�EZ ORTIZ, JULIO`, `LOPEZ FARI�A`, `ACU�A`, `ESC. N� 125`.
**2.031 nombres afectados.**

Los bytes originales están perdidos (son `EF BF BD` reales, no latin-1 mal interpretado), así
que **no se puede reparar con una conversión**: hay que re-exportar el CSV desde la fuente en
UTF-8. Importarlo así dejaría dos mil apellidos mal escritos de forma permanente en la base.

## 3. Cruce contra los choferes — el hallazgo principal

605 CI únicos de choferes contra los 35.192 del padrón:

| Resultado | Cantidad | % |
|---|---:|---:|
| **Chofer encontrado en el padrón** | **535** | 88,4 % |
| Chofer no encontrado | 70 | 11,6 % |

### El campo manual "Vota en Villa Hayes" estaba mal en 89 casos

| Declarado en la planilla | Está en el padrón | No está | Total |
|---|---:|---:|---:|
| **SI** | 398 | **5 ❌** | 403 |
| **NO** | **84 ❌** | 51 | 135 |
| (vacío) | 117 | 20 | 137 |

- **84 choferes marcados como "NO vota en Villa Hayes" sí están en el padrón.**
- 5 marcados como "SI" no aparecen.
- 137 que estaban sin declarar quedan resueltos automáticamente (117 sí / 20 no).

Es la confirmación más limpia del principio de diseño: **ese campo no se captura a mano,
se deriva del padrón**. El dato manual tenía un 16 % de error comprobable.

### 3 casos donde el CI coincide pero el nombre no

| CI | Nombre en la planilla | Nombre en el padrón |
|---|---|---|
| 6813360 | Jonathan Aveiro | RIVEIRO VERGARA, JONATAN RAFAEL |
| 3663303 | Nicolasa Marino | MARIO VDA DE SOSA, EVELIA FILOMENA |

(El primero aparece dos veces por el duplicado ya detectado.)

Son CI mal tipeados o identidad equivocada. **El importador debe marcarlos como conflicto**, no
resolverlos solo: verificar por nombre después de cruzar por CI atrapa exactamente este error.
505 coinciden exactamente y 91 parcialmente (orden de nombre/apellido, nombres compuestos).

## 4. Qué aporta el padrón a cada chofer

Para los 535 encontrados, el sistema pasa a conocer sin carga manual:

| Dato | Disponible |
|---|---:|
| Local de votación | 599 filas |
| Mesa y orden | 599 |
| Dirección | 568 |
| Afiliación partidaria | 599 |
| Seccional | 507 |

**Distribución de choferes por local:** Blas Garay 233 · Defensores del Chaco 154 ·
Rutherford B. Hayes 69 · Lic. Nac. Defensores del Chaco 65 · Remansito 47 · Don Jorge Gayoso 28 ·
Patricio Colman 3.

**Afiliación de los choferes:** ANR 299 · ANR+PLRA 88 · sin afiliación 60 · ANR+PLRA+UNACE 32 ·
ANR+UNACE 17 · PLRA 12.

**Participación en jun2026:** 458 `S` · 49 `N` · 168 sin dato.

> Estas dos últimas columnas se importan sin restricción especial de acceso (decisión del
> responsable del proyecto). Ver la nota de diseño en `docs/security.md` §6.

## 5. Impacto en el modelo de datos

1. `padron_snapshots` + `padron_electoral` se confirman tal como estaban propuestos, más los
   campos `partidos`, `seccional` y `direccion`.
2. Se agrega **`padron_participacion`** en formato largo (`snapshot_id`, `ci`, `eleccion_codigo`,
   `voto`) en vez de una columna por elección: el padrón trae 5 elecciones hoy y va a traer más.
   Una columna por elección obliga a migrar el esquema cada vez.
3. `locales_votacion` se siembra con los 7 locales reales y sus códigos.
4. `personas.verificado_en_padron` pasa a ser un dato derivado y confiable.
5. La zona `6 POZO COLORADO` (5.690 electores) no es Villa Hayes ciudad: el catálogo de barrios
   tiene que contemplarla o excluirla explícitamente.

## 6. Pendientes antes de la importación

- [ ] **Re-exportar el CSV en UTF-8** (bloqueante — si no, se pierden 2.031 apellidos).
- [ ] Confirmar la fecha de corte del padrón y su origen, para `padron_snapshots`.
- [ ] Decidir qué se hace con los 70 choferes que no están en el padrón de Villa Hayes:
      ¿votan en otro distrito y se aceptan igual, o requieren revisión? (nueva decisión **D-21**).
- [ ] Revisar manualmente los 3 CI con nombre discrepante.
