# Roles y permisos

Versión 0.2 — decisiones D-07, D-08, D-12 y D-16 aplicadas · 2026-09-12

---

## 1. Principios

0. **Primero la organización.** Todo usuario pertenece a una organización y **nunca** ve datos
   de otra (D-12). Este filtro es la primera condición de toda política RLS y no lo levanta
   ningún permiso, ni el de `super_admin` de otra organización.
1. **Mínimo privilegio.** Nadie tiene un permiso "por las dudas".
2. **Rol + scope.** El rol dice *qué* puede hacer; `usuario_scopes` dice *sobre qué datos*.
   Un supervisor y un coordinador pueden tener el mismo permiso `choferes.ver` y ver conjuntos
   completamente distintos.
3. **Separación de funciones.** Quien da de alta un chofer no autoriza su pago. Quien solicita
   una excepción no la aprueba.
4. **El permiso se verifica en la base**, no en el menú. La UI sólo oculta.

## 2. Roles

| Código | Nombre | Descripción | Scope típico |
|---|---|---|---|
| `super_admin` | Super administrador | Configuración del sistema, usuarios, roles, cierre de elección. Máximo 2 personas. | Global |
| `admin` | Administrador del operativo | Cupos, catálogos, excepciones, reportes completos. | Global |
| `coordinador` | Coordinador de logística | Alta/edición de choferes, asignaciones, solicita excepciones. | Global o por candidato |
| `tesoreria` | Tesorería / Caja | Folios, contratos, vales, anticipos, pagos, arqueo. | Global |
| `supervisor` | Supervisor / Referente | Sus choferes y su barrio: consulta, actualiza contacto y presencia. | Barrio(s) / supervisor |
| `candidato` | Candidato / Concejal | Consulta de sus choferes, su cupo y su estado de actividad. | Candidato |
| `operador` | Operador de carga | Carga de datos e importación a staging. Sin caja ni lista negra. | Global (sin montos) |
| `auditor` | Auditor | Sólo lectura total, incluyendo bitácora. Sin escritura en ninguna tabla. | Global |
| `consulta` | Consulta | Sólo lectura de listados sin PII ni montos. | Global limitado |

> **`candidato` confirmado (D-08):** los concejales tienen acceso directo, limitado a lo suyo.
> Su scope es `tipo = 'candidato'` con su propio `candidato_id`: ven sus choferes, su cupo y la
> actividad de su gente. **No ven el cupo ni los choferes de otros candidatos**, ni la lista
> negra, ni los datos de caja. Es el rol donde el test negativo de RLS importa más, porque un
> error acá tiene consecuencias políticas, no sólo técnicas.

> **`super_admin` es por organización**, no global. No existe un rol que cruce organizaciones.

## 3. Catálogo de permisos

| Módulo | Permisos |
|---|---|
| Choferes | `choferes.ver`, `choferes.crear`, `choferes.editar`, `choferes.baja`, `choferes.ver_pii` |
| Personas | `personas.ver`, `personas.crear`, `personas.editar` |
| Asignaciones | `asignaciones.ver`, `asignaciones.asignar`, `asignaciones.reasignar` |
| Padrón | `padron.consultar`, `padron.importar` |
| Lista negra | `lista_negra.ver`, `lista_negra.gestionar`, `lista_negra.revocar` |
| Excepciones | `excepciones.ver`, `excepciones.solicitar`, `excepciones.aprobar` |
| Cupos | `cupos.ver`, `cupos.definir` |
| Contratos | `contratos.ver`, `contratos.generar`, `contratos.firmar`, `contratos.anular` |
| Folios | `folios.ver`, `folios.emitir_serie`, `folios.anular` |
| Caja | `caja.ver`, `caja.entregar_vale`, `caja.marcar_anticipo`, `caja.marcar_pago_final`, `caja.autorizar_pago`, `caja.cargar_monto`, `caja.arqueo` |
| GPS | `gps.ver`, `gps.gestionar_dispositivos`, `gps.recalcular` |
| Datos | `datos.importar`, `datos.confirmar_importacion`, `datos.exportar`, `datos.exportar_pii`, `datos.sincronizar_sheets` |
| Reportes | `reportes.ver`, `reportes.ver_montos` |
| Auditoría | `auditoria.ver`, `auditoria.exportar` |
| Administración | `admin.usuarios`, `admin.roles`, `admin.catalogos`, `admin.elecciones`, `admin.modo_lectura` |

## 4. Matriz rol × permiso

Leyenda: ✅ permitido · 🔸 permitido dentro de su scope · ❌ denegado

| Permiso | super_admin | admin | coordinador | tesoreria | supervisor | candidato | operador | auditor | consulta |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `choferes.ver` | ✅ | ✅ | ✅ | ✅ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| `choferes.ver_pii` | ✅ | ✅ | ✅ | ✅ | 🔸 | ❌ | 🔸 | ✅ | ❌ |
| `choferes.crear` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `choferes.editar` | ✅ | ✅ | ✅ | ❌ | 🔸¹ | ❌ | ✅ | ❌ | ❌ |
| `choferes.baja` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `asignaciones.asignar` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `asignaciones.reasignar` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `padron.consultar` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `padron.importar` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lista_negra.ver` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `lista_negra.gestionar` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lista_negra.revocar` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `excepciones.solicitar` | ✅ | ✅ | ✅ | ✅ | 🔸 | ❌ | ❌ | ❌ | ❌ |
| `excepciones.aprobar` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `cupos.ver` | ✅ | ✅ | ✅ | ✅ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| `cupos.definir` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `contratos.generar` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `contratos.firmar` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `contratos.anular` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `folios.emitir_serie` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `folios.anular` | ✅ | ✅ | ❌ | 🔸² | ❌ | ❌ | ❌ | ❌ | ❌ |
| `caja.ver` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `caja.entregar_vale` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `caja.marcar_anticipo` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `caja.autorizar_pago` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `caja.marcar_pago_final` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `caja.cargar_monto` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `caja.arqueo` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `gps.ver` | ✅ | ✅ | ✅ | ❌ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| `gps.gestionar_dispositivos` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `datos.importar` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `datos.confirmar_importacion` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `datos.exportar` | ✅ | ✅ | ✅ | ✅ | 🔸 | 🔸 | ✅ | ✅ | ❌ |
| `datos.exportar_pii` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `reportes.ver_montos` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `auditoria.ver` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `admin.*` | ✅ | 🔸³ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

¹ El supervisor sólo edita contacto y observaciones de sus choferes, no candidato ni estado.
² Tesorería anula un folio propio el mismo día; después requiere admin.
³ `admin` no gestiona roles ni crea super administradores.

## 5. Separaciones de funciones obligatorias

| Acción A | Acción B | Regla |
|---|---|---|
| `excepciones.solicitar` | `excepciones.aprobar` | Distinta persona, forzado por `CHECK` |
| `caja.autorizar_pago` | `caja.pagar_final` | Distinto rol: `admin` autoriza, `tesoreria` paga |
| `choferes.crear` | `caja.*` | Ningún rol operativo tiene ambos |
| `datos.importar` | `datos.confirmar_importacion` | Carga el operador, confirma el admin |
| `lista_negra.gestionar` | `excepciones.aprobar` | Recomendado separar; si el equipo es chico, requiere doble registro en bitácora (D-11) |

## 6. Scopes

`usuario_scopes` define el universo de datos visible:

| Tipo | Campos | Ejemplo |
|---|---|---|
| `global` | — | Admin, tesorería, auditor — **dentro de su organización** |
| `candidato` | `candidato_id` | Concejal ve sus 375 choferes y sólo los suyos (D-08) |
| `barrio` | `barrio_id` | Supervisor de Barrio Alonso ve sus 93 |
| `supervisor` | `supervisor_id` | Referente ve los choferes que él cargó |

Un usuario puede acumular scopes. Los scopes tienen vigencia (`vigente_desde`/`vigente_hasta`)
para poder revocar accesos al cerrar el operativo **sin borrar el usuario**.

## 7. Ciclo de vida de un usuario

1. Alta por `admin.usuarios` → invitación por email.
2. Primer acceso obligatorio: cambio de contraseña + alta de MFA (roles de escritura).
3. Asignación de rol y scope, con vigencia.
4. Inactividad > 30 días → cuenta suspendida automáticamente.
5. **Cierre del operativo → todos los scopes vencen y todos los roles operativos se revocan
   en bloque.** Queda sólo lectura para auditoría.

## 8. Testing de permisos

El seed crea **dos organizaciones** y un usuario por rol en cada una. La suite pgTAP verifica,
por cada tabla:

- el rol puede hacer lo que la matriz dice que puede;
- **el rol no puede hacer lo que la matriz dice que no puede** (el caso que más se olvida);
- **ningún usuario de la organización A ve una sola fila de la organización B** — el test más
  importante del sistema, y se corre sobre las 45 tablas, no sobre algunas;
- un supervisor no ve datos de otro barrio;
- **un candidato no ve choferes ni cupos de otro candidato** (D-08);
- `consulta` nunca recibe CI ni teléfono completos;
- ninguna función de caja consulta `padron_participacion`;
- nadie puede escribir en `audit_log`.

Un PR que agregue una tabla sin test de RLS y sin test de aislamiento entre organizaciones no
se aprueba.
