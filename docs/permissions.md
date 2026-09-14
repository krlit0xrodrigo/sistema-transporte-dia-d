# Roles y permisos v2

Versión 2.0 — 2026-09-12

---

## 1. Principios

0. **Primero la organización.** Todo usuario pertenece a una organización y **nunca** ve datos
   de otra. Este filtro es la primera condición de toda política RLS.
1. **Mínimo privilegio.** Nadie tiene un permiso "por las dudas".
2. **Rol + scope.** El rol dice *qué* puede hacer; `usuario_scopes` dice *sobre qué datos*.
3. **Separación de funciones.** Quien da de alta no autoriza pago. Quien solicita excepción no la aprueba.
4. **El permiso se verifica en la base**, no en el menú. La UI sólo oculta.
5. **Mostrar únicamente módulos permitidos por rol.** Un supervisor no ve el menú de caja.

## 2. Roles

| Código | Nombre | Descripción | Scope típico |
|---|---|---|---|
| `super_admin` | Super administrador | Config del sistema, usuarios, roles, cierre | Global |
| `admin` | Administrador del operativo | Cupos, catálogos, excepciones, reportes | Global |
| `coordinador` | Coordinador de logística | Alta/edición de choferes, asignaciones | Global o candidato |
| `tesoreria` | Tesorería / Caja | Folios, contratos, vales, anticipos, pagos | Global |
| `supervisor` | Supervisor / Referente | Sus choferes y su barrio | Barrio(s) / supervisor |
| `candidato` | Candidato / Concejal | Solo sus choferes, su cupo y actividad | Candidato |
| `operador` | Operador de carga | Carga de datos, sin caja ni lista negra | Global (sin montos) |
| `auditor` | Auditor | Solo lectura total + bitácora | Global |
| `consulta` | Consulta | Solo lectura limitada, sin PII ni montos | Global limitado |

### Mapeo con roles del master prompt

| Master prompt | Rol del sistema |
|---|---|
| ADMIN | `admin` (+ `super_admin` para config) |
| SUPERVISOR | `supervisor` |
| CONCEJAL | `candidato` |
| CONSULTA | `consulta` |
| CAJA | `tesoreria` |

### Restricciones por rol

**ADMIN** puede: administrar usuarios, activar/desactivar, asignar roles, administrar scopes,
supervisores, concejales, cupos, consultar todo, importar, lista negra, excepciones, caja,
auditoría, exportar.

**SUPERVISOR** puede: consultar personas, cargar choferes, visualizar sus choferes/cupos,
gestionar acciones permitidas en su scope.
**NO puede:** modificar sus propios permisos, modificar sus propios cupos.

**CONCEJAL** (`candidato`): similar al supervisor, vinculado a su candidato/concejal.
Solo consulta su ámbito autorizado.

**CONSULTA**: solo lectura. Puede buscar, consultar fichas, antecedentes, padrón, lista negra,
excepciones, asignaciones, órdenes, reportes autorizados.
**NO puede:** crear, editar, eliminar, asignar, consumir cupos, modificar caja/usuarios/roles/permisos.
**Seguridad garantizada por RLS.** No confiar solo en ocultar botones.

**CAJA** (`tesoreria`): vales de combustible, anticipos, pagos finales. Cada operación registra
usuario, fecha, hora, estado, observación, monto. Separación entre autorización y ejecución.

## 3. Catálogo de permisos (61 permisos, 12 módulos)

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

✅ permitido · 🔸 permitido dentro de su scope · ❌ denegado

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

¹ Supervisor solo edita contacto y observaciones de sus choferes.
² Tesorería anula folio propio el mismo día; después requiere admin.
³ `admin` no gestiona roles ni crea super administradores.

## 5. Separaciones de funciones obligatorias

| Acción A | Acción B | Regla |
|---|---|---|
| `excepciones.solicitar` | `excepciones.aprobar` | Distinta persona (CHECK) |
| `caja.autorizar_pago` | `caja.marcar_pago_final` | Distinto rol: admin autoriza, tesorería paga |
| `choferes.crear` | `caja.*` | Ningún rol operativo tiene ambos |
| `datos.importar` | `datos.confirmar_importacion` | Carga el operador, confirma el admin |
| `lista_negra.gestionar` | `excepciones.aprobar` | Separar; si equipo chico, doble registro |

## 6. Scopes

| Tipo | Campos | Ejemplo |
|---|---|---|
| `global` | — | Admin, tesorería, auditor — dentro de su organización |
| `candidato` | `candidato_id` | Concejal ve sus choferes y solo los suyos |
| `barrio` | `barrio_id` | Supervisor de un barrio ve los suyos |
| `supervisor` | `supervisor_id` | Referente ve los choferes que cargó |

Un usuario puede acumular scopes. Vigencia con `vigente_desde`/`vigente_hasta`.

## 7. Navegación visible por rol

| Sección | Módulo | super_admin | admin | coordinador | tesoreria | supervisor | candidato | operador | auditor | consulta |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| OPERACIÓN | Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | Consulta | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | Choferes | ✅ | ✅ | ✅ | ❌ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| | Alta | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| | Asignaciones | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Órdenes | ✅ | ✅ | ✅ | ✅ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| CONTROL | Cupos | ✅ | ✅ | ✅ | ✅ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| | Lista negra | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Antecedentes | ✅ | ✅ | ✅ | ❌ | 🔸 | 🔸 | ✅ | ✅ | ✅ |
| | Reportes | ✅ | ✅ | ✅ | ✅ | 🔸 | 🔸 | ✅ | ✅ | ❌ |
| | GPS | ✅ | ✅ | ✅ | ❌ | 🔸 | 🔸 | ✅ | ✅ | 🔸 |
| CAJA | Contratos | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Combustible | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Anticipos | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Pagos | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| ADMIN | Usuarios | ✅ | 🔸 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | Auditoría | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Configuración | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 8. Ciclo de vida de un usuario

1. Alta por `admin.usuarios` → invitación por email
2. Primer acceso: cambio de contraseña + MFA (roles de escritura)
3. Asignación de rol y scope con vigencia
4. Inactividad > 30 días → suspendida
5. Cierre del operativo → todos los scopes vencen, roles operativos revocados
6. No eliminar físicamente si afecta auditoría — preferir desactivación

## 9. Testing de permisos

El seed crea **dos organizaciones** y un usuario por rol en cada una. La suite pgTAP verifica:

- El rol puede hacer lo que la matriz dice que puede
- **El rol NO puede hacer lo que la matriz dice que no puede** (caso negativo)
- **Ningún usuario de org A ve datos de org B** — el test más importante
- Supervisor no ve datos de otro barrio
- **Candidato no ve choferes ni cupos de otro candidato**
- `consulta` nunca recibe CI ni teléfono completos
- Ninguna función de caja consulta `padron_participacion`
- Nadie puede escribir en `audit_log`
