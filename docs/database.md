# Modelo de datos

Versión 0.2 — decisiones D-01 a D-19 aplicadas · 2026-09-12
**Propuesta. Ninguna tabla debe crearse hasta la aprobación de la Fase 1.**
PostgreSQL 15+ sobre Supabase.

> **Cambios respecto de la v0.1:** multi-organización (D-12) · padrón real importado con
> participación por elección (D-01) · historial de apariciones para los duplicados (D-03) ·
> sin `miembros_mesa` (D-07) · sin `sincronizaciones_sheets` (D-19) · CI obligatorio (D-18) ·
> contrato simplificado (D-09) · montos opcionales en caja (D-16).

---

## 1. Convenciones

- `id uuid primary key default gen_random_uuid()`.
- `created_at`, `updated_at` `timestamptz not null default now()`; `deleted_at timestamptz`.
- `created_by`, `updated_by` → `usuarios.id`.
- Enums de dominio como tipos `enum` de PostgreSQL, no texto libre.
- **Toda tabla de dominio lleva `organizacion_id`** (D-12) y, si es operativa, `eleccion_id`.
- RLS habilitado en todas las tablas; `force row level security` en las sensibles.
- Índice obligatorio sobre toda columna usada en una política RLS.

## 2. Mapa de módulos — 45 tablas

| Módulo | Tablas | # |
|---|---|---:|
| A. Organización y acceso | `organizaciones`, `usuarios`, `roles`, `usuario_roles`, `permisos`, `rol_permisos`, `usuario_scopes` | 7 |
| B. Contexto electoral | `elecciones`, `barrios`, `locales_votacion`, `mesas`, `candidatos`, `supervisores`, `alias_catalogo` | 7 |
| C. Padrón | `padron_snapshots`, `padron_electoral`, `padron_participacion` | 3 |
| D. Personas y choferes | `personas`, `vehiculos`, `choferes`, `chofer_vehiculos`, `asignaciones` | 5 |
| E. Control | `lista_negra`, `excepciones`, `antecedentes` | 3 |
| F. Cupos | `cupos`, `cupo_movimientos` | 2 |
| G. Contratos y caja | `folios_series`, `folios`, `contratos`, `vales_combustible`, `anticipos`, `pagos_finales`, `movimientos_caja`, `arqueos` | 8 |
| H. GPS | `dispositivos_gps`, `traccar_eventos`, `actividad_diaria` | 3 |
| I. Datos y trazabilidad | `origenes_planilla`, `importaciones`, `importacion_filas`, `apariciones_origen`, `exportaciones` | 5 |
| J. Auditoría | `audit_log`, `accesos_sensibles` | 2 |

---

## 3. Detalle por módulo

### A. Organización y acceso

**`organizaciones`** *(nuevo — D-12)* — `id`, `codigo` (único), `nombre`, `activo`,
`configuracion jsonb`.
Es la raíz de aislamiento del sistema. Cada operativo político es una organización; los datos
de una nunca son visibles desde otra, y eso se hace cumplir en RLS, no en la aplicación.

**`usuarios`** — perfil ligado 1:1 a `auth.users`: `id (= auth.users.id)`, `organizacion_id`,
`email`, `nombre_completo`, `persona_id?`, `activo`, `mfa_habilitado`, `ultimo_acceso`.

**`roles`** — `id`, `codigo` (único), `nombre`, `descripcion`, `nivel`.
Catálogo global, compartido entre organizaciones.

**`usuario_roles`** — `usuario_id`, `rol_id`, `organizacion_id`, `eleccion_id?`. PK compuesta.

**`permisos`** — `id`, `codigo` (`choferes.crear`, `caja.pagar`…), `modulo`, `descripcion`.

**`rol_permisos`** — `rol_id`, `permiso_id`. PK compuesta.

**`usuario_scopes`** — **clave de RLS.** `usuario_id`, `organizacion_id`, `eleccion_id`,
`tipo` (`global`|`candidato`|`barrio`|`supervisor`), `candidato_id?`, `barrio_id?`,
`supervisor_id?`, `vigente_desde`, `vigente_hasta`.
Un usuario puede acumular scopes (supervisor de 3 barrios, por ejemplo).

### B. Contexto electoral

**`elecciones`** — `id`, `organizacion_id`, `nombre`, `tipo`
(`interna`|`municipal`|`general`|`otra`), `fecha`, `estado`
(`planificacion`|`activa`|`cerrada`), `municipio`, `departamento`.
Primer registro real: **Internas ANR Municipales — 07/06/2026** (elección de referencia del
histórico existente).

**`barrios`** — `id`, `organizacion_id`, `codigo`, `nombre`, `municipio`, `zona`, `activo`.
Semilla: los 23 barrios detectados, normalizados. La zona `6 POZO COLORADO` del padrón
(5.690 electores) se contempla como zona aparte o se excluye explícitamente.
*Sin polígono geográfico (D-15).*

**`locales_votacion`** — `id`, `codigo`, `nombre`, `zona`, `barrio_id?`, `direccion?`.
Semilla real desde el padrón — los 7 locales:

| Código | Nombre | Electores |
|---:|---|---:|
| 1 | Lic. Nac. Defensores del Chaco | 3.906 |
| 2 | Esc. N° 125 Pte. Hayes (Rutherford B. Hayes) | 3.575 |
| 3 | Esc. Defensores del Chaco | 6.424 |
| 4 | Col. Nac. Dr. Blas Garay | 6.809 |
| 501 | Esc. de Remansito | 6.110 |
| 504 | Esc. N° 5925 Don Jorge Gayoso | 2.678 |
| 509 | Esc. N° 1152 Gral. Patricio Colman | 5.690 |

**`mesas`** — `id`, `local_votacion_id`, `numero` (1–20), `eleccion_id?`, `cantidad_electores?`.

**`candidatos`** — `id`, `organizacion_id`, `persona_id`, `eleccion_id`, `tipo`
(`concejal`|`intendente`|`otro`), `nombre_publico`, `apodo`, `lista`, `orden_lista`,
`preferenciales`, `activo`.

**`supervisores`** — `id`, `organizacion_id`, `persona_id`, `eleccion_id`, `candidato_id?`,
`alias`, `activo`.

**`alias_catalogo`** — `id`, `organizacion_id`, `tipo` (`barrio`|`candidato`|`supervisor`),
`entidad_id`, `alias_texto`, `origen`. Mapea las variantes de texto de las planillas
(17 candidatos, 23 barrios, 22 supervisores). Único por `(tipo, alias_texto, organizacion_id)`.

### C. Padrón *(confirmado con datos reales — D-01)*

**`padron_snapshots`** — `id`, `anio`, `fuente`, `fecha_corte`, `archivo_hash`, `encoding`,
`filas`, `importado_por`, `fecha_import`, `vigente`.
El padrón es transversal a las organizaciones: es un dato público, no propiedad de un operativo.

**`padron_electoral`** — `id`, `snapshot_id`, `ci`, `nombre_completo`, `apellidos`, `nombres`,
`local_votacion_id`, `mesa`, `orden`, `direccion?`, `zona`, `partidos?`, `seccional?`.
Único `(snapshot_id, ci)`; índice sobre `ci`. **Solo lectura desde la aplicación.**
35.192 filas en el snapshot actual, **sin un solo CI duplicado**.

**`padron_participacion`** *(nuevo)* — `id`, `snapshot_id`, `ci`, `eleccion_codigo`
(`jun2021`, `oct2021`, `dic2022`, `abr2023`, `jun2026`…), `voto` (`S`|`N`).
**Formato largo a propósito:** el padrón trae 5 elecciones hoy y va a traer más. Una columna por
elección obliga a migrar el esquema cada vez que llega un archivo nuevo.
Único `(snapshot_id, ci, eleccion_codigo)`.

### D. Personas y choferes

**`personas`** — raíz de identidad.
`id`, `organizacion_id`, **`ci` (obligatorio, único por organización, normalizado: sólo dígitos,
sin ceros a la izquierda)**, `ci_original`, `nombres`, `apellidos`,
`nombre_completo (generated)`, `telefono_e164?`, `telefono_original?`, `barrio_residencia_id?`,
`padron_ci?` (verificación contra el snapshot vigente), `verificado_en_padron` (bool derivado),
`estado_identidad` (`verificada`|`fuera_de_padron`|`discrepancia_nombre`), `observaciones`.

> **D-18 aplicado:** no existe estado `sin_ci`. Los 20 registros sin cédula se descartan en la
> importación, con informe de las filas rechazadas.
> `estado_identidad = 'discrepancia_nombre'` cubre los 3 casos donde el CI coincide con el
> padrón pero el nombre no.

**`vehiculos`** — `id`, `organizacion_id`, `chapa` (normalizada), `categoria`
(`automovil`|`camioneta`|`minibus`|`motocicleta`), `marca?`, `modelo?`, `anio?`,
`propietario_persona_id?`, `observaciones`.

**`choferes`** — participación de una persona en una elección.
`id`, `organizacion_id`, `persona_id`, `eleccion_id`, `numero_orden?`, `estado_servicio`
(`contratado`|`voluntario`|`pendiente`), `estado` (`borrador`|`activo`|`suspendido`|`baja`),
`fecha_alta`, `dado_de_baja_en?`, `motivo_baja?`, `origen_planilla_id`, `observaciones`.

**`chofer_vehiculos`** — `chofer_id`, `vehiculo_id`, `principal`, `desde`, `hasta?`.

**`asignaciones`** — `id`, `chofer_id`, `eleccion_id`, `candidato_id`, `barrio_id?`,
`supervisor_id?`, `vigente_desde`, `vigente_hasta?`, `motivo_cambio?`, `asignado_por`.
Historial completo: reasignar cierra la vigente y abre otra, nunca hace `UPDATE`.

### E. Control

**`lista_negra`** — `id`, `organizacion_id`, `persona_id`, `motivo_codigo`, `motivo_detalle`,
`eleccion_origen_id?`, `evidencia_url?`, `severidad` (`bloqueo_total`|`advertencia`),
`vigente_desde`, `vigente_hasta?` (**nulo = indefinido, valor por defecto**, coherente con D-10),
`registrado_por`, `aprobado_por`, `revocado_en?`, `revocado_por?`, `motivo_revocacion?`.
Catálogo de motivos pendiente de aprobación (D-06).

**`excepciones`** — `id`, `organizacion_id`, `persona_id?`, `chofer_id?`, `eleccion_id`, `tipo`
(`lista_negra`|`cupo`|`fuera_de_padron`|`doble_vehiculo`|`sin_actividad`|`otro`), `motivo`,
`solicitado_por`, `aprobado_por` (≠ solicitante), `aprobado_en`, `vence_en`,
`estado` (`pendiente`|`aprobada`|`rechazada`|`vencida`), `evidencia_url?`.

**`antecedentes`** — `id`, `organizacion_id`, `persona_id`, `eleccion_id`, `rol`,
`resultado` (`cumplio`|`no_cumplio`|`parcial`|`sin_datos`), `km_recorridos?`, `tuvo_gps`,
`anticipo_pagado?`, `pago_finalizado?`, `incidentes?`,
`confiabilidad_dato` (`alta`|`media`|`baja`), `fuente`.
El histórico del 07/06/2026 entra con `confiabilidad_dato = 'baja'` y
`fuente = 'reporte_cruce_por_nombre'`.

### F. Cupos *(D-05: los tres ámbitos en cascada)*

**`cupos`** — `id`, `organizacion_id`, `eleccion_id`, `ambito`
(`candidato`|`barrio`|`supervisor`|`global`), `candidato_id?`, `barrio_id?`, `supervisor_id?`,
`limite`, `definido_por`, `vigente_desde`, `notas`.

**`cupo_movimientos`** — `id`, `cupo_id`, `chofer_id`, `delta` (+1/−1), `motivo`,
`excepcion_id?`, `registrado_por`, `created_at`.
El consumo es la suma de movimientos, nunca un contador editable.

**Cascada:** un alta consume cupo de candidato **y** de barrio **y** de supervisor cuando los
tres están definidos. Si cualquiera está agotado, el alta se bloquea.

### G. Contratos y caja *(D-09 y D-16 aplicados)*

**`folios_series`** — `id`, `organizacion_id`, `eleccion_id`, `tipo_documento`
(`contrato`|`vale_combustible`|`anticipo`|`pago_final`), `prefijo`, `desde`, `hasta`,
`asignado_a_usuario_id?`, `estado`.

**`folios`** — `id`, `serie_id`, `numero`, `numero_completo (generated)`, `estado`
(`disponible`|`asignado`|`usado`|`anulado`), `documento_tipo?`, `documento_id?`,
`asignado_a_usuario_id?`, `usado_en?`, `anulado_en?`, `motivo_anulacion?`.

**`contratos`** *(simplificado — D-09)* — `id`, `organizacion_id`, `chofer_id`, `eleccion_id`,
`folio_id?`, **`firmado` (bool)**, `fecha_firma?`, `registrado_por`, `monto_acordado?` (nulo
permitido), `estado` (`pendiente`|`firmado`|`anulado`), `observaciones?`.
Sin generación de PDF ni evidencia fotográfica obligatoria: es una marca con fecha y responsable.

**`vales_combustible`** — `id`, `chofer_id`, `eleccion_id`, `folio_id?`, `entregado` (bool),
`fecha_entrega?`, `entregado_por?`, `monto?`, `litros?`, `estacion?`, `estado`.

**`anticipos`** — `id`, `chofer_id`, `eleccion_id`, `folio_id?`, **`pagado` (bool)**,
`fecha_pago?`, `pagado_por?`, `monto?` (opcional), `estado`.

**`pagos_finales`** — `id`, `chofer_id`, `eleccion_id`, `folio_id?`, **`finalizado` (bool)**,
`fecha_finalizacion?`, `autorizado_por?`, `registrado_por`, `monto?` (opcional),
`basado_en_actividad` (bool), `excepcion_id?`, `estado`.

**`movimientos_caja`** — `id`, `organizacion_id`, `eleccion_id`, `fecha`, `tipo`
(`ingreso`|`egreso`), `concepto`, `monto`, `documento_tipo?`, `documento_id?`,
`responsable_usuario_id`, `observaciones`. **Append-only**: una corrección es un contramovimiento.
*Opcional en v1: se usa sólo si se cargan montos.*

**`arqueos`** — `id`, `organizacion_id`, `eleccion_id`, `responsable_usuario_id`, `fecha`,
`saldo_inicial`, `ingresos`, `egresos`, `saldo_teorico (generated)`, `saldo_declarado`,
`diferencia (generated)`, `estado`, `observaciones`.
*Disponible, no obligatorio en v1.*

### H. GPS *(D-04 y D-15 aplicados)*

**`dispositivos_gps`** — `id`, `organizacion_id`, `traccar_device_id` (único),
`unique_id` (único), `nombre`, `chofer_id?`, `vehiculo_id?`, `eleccion_id`, `estado`
(`pendiente_alta`|`activo`|`inactivo`|`baja`), `alta_en?`, `baja_en?`, `ultimo_contacto?`.
**El vínculo con el chofer es esta FK. Nunca un *match* por nombre.**

**`traccar_eventos`** — `id`, `dispositivo_id`, `eleccion_id`, `traccar_event_id?`, `tipo`,
`ocurrido_en`, `lat?`, `lng?`, `velocidad?`, `atributos jsonb`, `ingerido_en`.

**`actividad_diaria`** — `id`, `chofer_id`, `eleccion_id`, `fecha`, **`km_recorridos`**,
`primer_evento?`, `ultimo_evento?`, `eventos_movimiento`, `eventos_pasivos`,
`clasificacion` (`activo`|`inactivo`|`sin_dispositivo`|`sin_datos`),
`criterio_version` (`v1_movimiento`), `calculado_en`.

> **D-04:** sin umbral de kilómetros. `activo` = existe al menos un evento de movimiento en la
> fecha. Los km se calculan y se muestran como información, no como condición.

### I. Datos y trazabilidad

**`origenes_planilla`** — `id`, `organizacion_id`, `codigo`, `nombre`, `tipo`
(`excel`|`google_sheets`|`carga_manual`|`api`|`contingencia_papel`), `descripcion`, `activo`.

**`importaciones`** — `id`, `organizacion_id`, `origen_planilla_id`, `archivo_nombre`,
`archivo_hash` (sha256), `hoja?`, `filas_totales`, `filas_ok`, `filas_error`,
`filas_conflicto`, `estado`, `importado_por`, `confirmado_por?`, `confirmado_en?`,
`resumen jsonb`.

**`importacion_filas`** — `id`, `importacion_id`, `numero_fila`, `datos_crudos jsonb`,
`datos_normalizados jsonb`, `estado` (`ok`|`error`|`conflicto`|`omitida`|`aplicada`|`rechazada`),
`errores jsonb`, `entidad_tipo?`, `entidad_id?`, `resuelto_por?`, `resolucion?`.

**`apariciones_origen`** *(nuevo — D-03)* — el registro que hace visible la duplicación.
`id`, `organizacion_id`, `persona_id`, `eleccion_id`, `importacion_id?`, `origen_planilla_id`,
`hoja?`, `numero_fila?`, `nombre_texto`, `candidato_texto?`, `barrio_texto?`,
`supervisor_texto?`, `estado_texto?`, `fue_aplicada` (bool), `detectado_en`.

> Cada vez que un CI aparece en una planilla se inserta una fila acá — **incluso las apariciones
> descartadas**. La ficha del chofer muestra: *"Este CI apareció 3 veces: hoja Choferes fila 32
> (Concejal Venus Nuñez, Barrio Alonso) · fila 382 (Concejal Negro Nuñez) · fila 602 (Concejal
> Negro Nuñez, en mayúsculas). Participación activa: la primera."*
> Una sola participación activa, toda la historia visible.

**`exportaciones`** — `id`, `organizacion_id`, `usuario_id`, `tipo`, `formato`,
`filtros jsonb`, `filas`, `incluye_pii`, `archivo_url?`, `created_at`.

> `sincronizaciones_sheets` **eliminada** (D-19): Google Sheets es sólo importación inicial y
> entra por el mismo pipeline que un Excel, registrado en `importaciones`.

### J. Auditoría

**`audit_log`** — `id bigserial`, `organizacion_id`, `tabla`, `registro_id`, `operacion`,
`datos_anteriores jsonb`, `datos_nuevos jsonb`, `campos_modificados text[]`, `usuario_id`,
`rol_efectivo`, `ip`, `user_agent`, `ocurrido_en`.
**Sin `update` ni `delete` para ningún rol de aplicación.**

**`accesos_sensibles`** — `id`, `organizacion_id`, `usuario_id`, `recurso`
(`padron`|`lista_negra`|`caja`|`pii`), `entidad_id?`, `accion` (`consulta`|`exportacion`),
`contexto jsonb`, `ocurrido_en`.

---

## 4. Relaciones principales

```
organizaciones 1──N elecciones 1──┬──N choferes ──1── personas ──?── padron_electoral
      │                           │                       │              │
      │                           │                       │              └──N padron_participacion
      │                           │                       ├──N lista_negra
      │                           │                       ├──N antecedentes
      │                           │                       └──N apariciones_origen   ← D-03
      │                           │
      │                           ├──N asignaciones ──┬──1 candidatos ──1── personas
      │                           │                   ├──1 barrios ──1──N locales_votacion ──1──N mesas
      │                           │                   └──1 supervisores ──1── personas
      │                           │
      │                           ├──N cupos ──1──N cupo_movimientos ──1── choferes   (cascada: cand+barrio+super)
      │                           ├──N excepciones
      │                           ├──N folios_series ──1──N folios ──?──1 {contratos, vales, anticipos, pagos}
      │                           ├──N movimientos_caja ──N──1 arqueos      (opcional en v1)
      │                           ├──N dispositivos_gps ──1──N traccar_eventos
      │                           ├──N actividad_diaria ──N──1 choferes
      │                           └──N importaciones ──1──N importacion_filas
      │
      ├──N usuarios ──N──N roles (usuario_roles) ; roles ──N──N permisos (rol_permisos)
      └──N usuario_scopes → {candidato | barrio | supervisor | global}

choferes 1──N chofer_vehiculos N──1 vehiculos
padron_snapshots 1──N padron_electoral · 1──N padron_participacion   (transversal a organizaciones)
```

### Cardinalidades que importan

| Relación | Regla |
|---|---|
| `personas` ↔ `choferes` | 1 : N entre elecciones, **1 : 1 dentro de una elección** |
| `personas` ↔ `apariciones_origen` | 1 : N — **acá vive la evidencia de los 64 duplicados** |
| `choferes` ↔ `asignaciones` | 1 : N histórico, **1 vigente** (D-17) |
| `vehiculos` ↔ `choferes` | N : M histórico, 1 chofer activo por vehículo |
| `folios` ↔ documento | 1 : 1 estricto, sin reutilización |
| `padron_electoral` ↔ `padron_participacion` | 1 : N por elección del padrón |
| `organizaciones` ↔ todo | 1 : N, **aislamiento forzado por RLS** |

---

## 5. Restricciones de integridad clave

```sql
-- 1. Un CI, una participación activa por elección  (los 64 duplicados dejan de ser posibles)
create unique index ux_chofer_persona_eleccion
  on choferes (persona_id, eleccion_id)
  where deleted_at is null and estado <> 'baja';

-- 2. CI obligatorio, normalizado y único por organización  (D-18)
alter table personas alter column ci set not null;
alter table personas add constraint ck_ci_formato check (ci ~ '^[1-9][0-9]{4,8}$');
create unique index ux_personas_ci on personas (organizacion_id, ci);

-- 3. Una sola asignación vigente por chofer  (D-17)
create unique index ux_asignacion_vigente
  on asignaciones (chofer_id) where vigente_hasta is null;

-- 4. Un vehículo, un chofer activo
create unique index ux_vehiculo_activo
  on chofer_vehiculos (vehiculo_id) where hasta is null;

-- 5. Folio irrepetible
create unique index ux_folio_serie_numero on folios (serie_id, numero);
alter table folios add constraint ck_folio_documento
  check ((estado = 'usado') = (documento_id is not null));

-- 6. Excepción con aprobador distinto del solicitante
alter table excepciones add constraint ck_excepcion_aprobador
  check (estado <> 'aprobada' or (aprobado_por is not null and aprobado_por <> solicitado_por));

-- 7. Teléfono normalizado a E.164
alter table personas add constraint ck_telefono
  check (telefono_e164 is null or telefono_e164 ~ '^\+595[0-9]{9}$');

-- 8. Un solo pago final vigente por chofer  (imposibilita el doble pago)
create unique index ux_pago_final_chofer
  on pagos_finales (chofer_id, eleccion_id) where estado <> 'anulado';

-- 9. Padrón: cédula única por snapshot  (verificado: 35.192 CI, 0 duplicados)
create unique index ux_padron_snapshot_ci on padron_electoral (snapshot_id, ci);
create unique index ux_padron_part on padron_participacion (snapshot_id, ci, eleccion_codigo);
```

## 6. Funciones de negocio (RPC)

| Función | Responsabilidad |
|---|---|
| `fn_alta_chofer(payload jsonb)` | Valida CI obligatorio, padrón, lista negra, cupo en cascada y duplicado; crea persona/chofer/asignación; registra la aparición de origen; consume los tres cupos; todo en una transacción |
| `fn_consumir_cupo_cascada(eleccion_id, candidato_id, barrio_id, supervisor_id, chofer_id, excepcion_id)` | Bloquea y verifica los tres ámbitos (D-05) |
| `fn_asignar_folio(serie_id, doc_tipo, doc_id)` | Siguiente folio con `for update skip locked` |
| `fn_verificar_padron(ci)` | Devuelve presencia, local, mesa, orden, dirección, afiliación y participación desde el snapshot vigente; registra en `accesos_sensibles` |
| `fn_recalcular_actividad(eleccion_id, fecha, criterio_version)` | Reconstruye `actividad_diaria` desde `traccar_eventos` |
| `fn_confirmar_importacion(importacion_id)` | Aplica filas `ok` + conflictos resueltos; **rechaza las filas sin CI** (D-18) |
| `fn_normalizar_ci(text)` / `fn_normalizar_telefono(text)` | Usadas por el importador y por los `CHECK` |

## 7. Estrategia RLS

### 7.1 Funciones auxiliares (`security definer`, `stable`)

```sql
auth_usuario_id()            -- auth.uid()
auth_organizacion_id()       -- organización del usuario  ← primer filtro SIEMPRE
auth_es_admin()
auth_tiene_permiso(codigo)
auth_eleccion_actual()
auth_candidatos_visibles()   -- setof uuid, desde usuario_scopes
auth_barrios_visibles()
auth_supervisores_visibles()
```

**Regla de oro multi-organización:** toda política empieza por
`organizacion_id = auth_organizacion_id()`. Es la primera condición, y con índice, para que corte
el conjunto antes de evaluar el resto.

### 7.2 Patrón de política

```sql
alter table choferes enable row level security;
alter table choferes force row level security;

create policy choferes_select on choferes for select using (
  organizacion_id = auth_organizacion_id()          -- aislamiento (D-12)
  and deleted_at is null
  and (
    auth_es_admin()
    or exists (
      select 1 from asignaciones a
      where a.chofer_id = choferes.id and a.vigente_hasta is null
        and ( a.candidato_id  in (select auth_candidatos_visibles())
           or a.barrio_id     in (select auth_barrios_visibles())
           or a.supervisor_id in (select auth_supervisores_visibles()) )
    )
  )
);

create policy choferes_insert on choferes for insert with check (
  organizacion_id = auth_organizacion_id()
  and auth_tiene_permiso('choferes.crear')
  and eleccion_id = auth_eleccion_actual()
);

create policy choferes_no_delete on choferes for delete using (false);
```

### 7.3 Políticas por tabla (resumen)

| Tabla | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `organizaciones` | La propia | Sólo `super_admin` | ❌ |
| `personas` | Organización + scope vía chofer | `personas.crear` / `.editar` | ❌ |
| `choferes`, `asignaciones` | Organización + scope | Permiso + elección actual | ❌ |
| `apariciones_origen` | Igual que el chofer de esa persona | Sólo vía importador/RPC | ❌ |
| `padron_electoral`, `padron_participacion` | `padron.consultar` (transversal, sin filtro de organización); registra acceso | Sólo rol importador | ❌ |
| `lista_negra` | `lista_negra.ver` — no visible a supervisor ni candidato | `lista_negra.gestionar` | ❌ |
| `excepciones` | Solicitante, aprobadores y admin | Solicitud / aprobación por permisos distintos | ❌ |
| `cupos`, `cupo_movimientos` | Organización + scope | Cupos: sólo admin. Movimientos: sólo RPC | ❌ |
| `contratos`, `vales_*`, `anticipos`, `pagos_finales` | `caja.ver`, o el propio scope sin montos | `caja.*` | ❌ |
| `movimientos_caja` | `caja.ver` | INSERT sí, UPDATE ❌ | ❌ |
| `folios*` | `folios.ver` | Sólo vía RPC | ❌ |
| `dispositivos_gps`, `actividad_diaria` | Organización + scope | Job / `gps.gestionar` | ❌ |
| `traccar_eventos` | Admin y auditor | Sólo job | ❌ |
| `importaciones*` | Importador y admin | `datos.importar` | ❌ |
| `audit_log`, `accesos_sensibles` | `auditoria.ver` | Sólo trigger | ❌ **para todos** |
| Catálogos | Autenticado de la organización | Sólo admin | ❌ |

### 7.4 Reglas transversales

1. Ninguna tabla sin RLS. Verificado en CI.
2. La `service_role` key evita RLS por diseño: sólo la usan el job de Traccar y el importador,
   en el servidor, con auditoría propia.
3. Los datos de contacto y el CI se exponen por **vistas** que los enmascaran para roles de
   consulta (`****5876`).
4. **El padrón es transversal a las organizaciones** (es un dato público) pero su consulta
   siempre queda registrada en `accesos_sensibles`.
5. Tests pgTAP por rol × tabla × operación, incluyendo el caso negativo y el cruce entre
   organizaciones.

## 8. Índices previstos

```
personas(organizacion_id, ci) · personas(telefono_e164) · personas(nombre_completo gin_trgm)
choferes(organizacion_id, eleccion_id, estado) · choferes(persona_id)
asignaciones(chofer_id) · (candidato_id, eleccion_id) · (barrio_id) · (supervisor_id)
apariciones_origen(persona_id, eleccion_id)
padron_electoral(snapshot_id, ci) · padron_electoral(ci) · padron_participacion(snapshot_id, ci)
cupo_movimientos(cupo_id) · folios(serie_id, estado)
traccar_eventos(dispositivo_id, ocurrido_en desc)
actividad_diaria(chofer_id, fecha)
audit_log(organizacion_id, tabla, registro_id) · audit_log(ocurrido_en desc)
usuario_scopes(usuario_id, organizacion_id, eleccion_id)
```

Búsqueda por nombre con `pg_trgm`, nunca con `LIKE '%…%'`.

## 9. Migración de los datos actuales

| Paso | Acción | Cifra esperada |
|---|---|---|
| 1 | Crear la organización y la elección *Internas ANR Municipales 07/06/2026* | 1 / 1 |
| 2 | Sembrar `locales_votacion` desde el padrón | 7 |
| 3 | **Re-exportar el padrón en UTF-8** e importarlo | 35.192 |
| 4 | Importar `padron_participacion` (5 elecciones) | ~95.000 filas |
| 5 | Cargar catálogos: barrios, candidatos, supervisores + `alias_catalogo` | 23 / 17 / 22 |
| 6 | Importar la hoja `Choferes` a staging | 695 |
| 7 | **Rechazar las filas sin CI** (D-18) | −20 |
| 8 | Registrar **todas** las apariciones en `apariciones_origen` | 675 |
| 9 | Resolver los 64 CI duplicados: una participación activa, el resto queda como aparición | 134 → 64 activas |
| 10 | Verificar contra padrón: derivar "vota en Villa Hayes" | 535 verificados · 70 fuera (D-21) |
| 11 | Marcar los 3 CI con nombre discrepante para revisión | 3 |
| 12 | Normalizar teléfonos a E.164; marcar los 4 truncados | 609 → ~605 |
| 13 | Crear `vehiculos` desde chapa/marca/modelo | 416 |
| 14 | Confirmar: `personas` + `choferes` + `asignaciones` | ~605 choferes |
| 15 | Cargar `cupos` en cascada desde `Hoja 1` | 40 referentes |
| 16 | Cargar `antecedentes` del 07/06/2026 con confiabilidad baja | ~673 |
| 17 | **No migrar** `COPIA`, las 21 hojas de planilla ni `Miembros de Mesa` (D-07) | — |
