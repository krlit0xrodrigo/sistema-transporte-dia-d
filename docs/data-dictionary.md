# Diccionario de datos

Versión 2.0 — 2026-09-12
Referencia de implementación para las 45 tablas del sistema.
Para el diseño conceptual, ver `database.md`.

---

## Convenciones

- PK: `id uuid primary key default gen_random_uuid()`
- Timestamps: `created_at`, `updated_at` `timestamptz not null default now()`, `deleted_at timestamptz`
- FK: `<tabla_singular>_id uuid references <tabla>(id)`
- Audit: `created_by`, `updated_by` → `usuarios.id`
- Toda tabla de dominio lleva `organizacion_id`
- Tablas operativas también llevan `eleccion_id`

---

## A. Organización y acceso (7 tablas)

### `organizaciones`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `codigo` | text | NO | — | UNIQUE |
| `nombre` | text | NO | — | — |
| `activo` | boolean | NO | true | — |
| `configuracion` | jsonb | SÍ | '{}' | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

### `usuarios`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | — | PK, = auth.users.id |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `email` | text | NO | — | UNIQUE |
| `nombre_completo` | text | NO | — | — |
| `persona_id` | uuid | SÍ | — | FK personas |
| `activo` | boolean | NO | true | — |
| `mfa_habilitado` | boolean | NO | false | — |
| `ultimo_acceso` | timestamptz | SÍ | — | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

### `roles`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `codigo` | text | NO | — | UNIQUE |
| `nombre` | text | NO | — | — |
| `descripcion` | text | SÍ | — | — |
| `nivel` | integer | NO | — | — |

**Valores semilla:** `super_admin`, `admin`, `coordinador`, `tesoreria`, `supervisor`, `candidato`, `operador`, `auditor`, `consulta`

### `usuario_roles`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `usuario_id` | uuid | NO | — | FK usuarios, PK compuesta |
| `rol_id` | uuid | NO | — | FK roles, PK compuesta |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `eleccion_id` | uuid | SÍ | — | FK elecciones |

### `permisos`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `codigo` | text | NO | — | UNIQUE |
| `modulo` | text | NO | — | — |
| `descripcion` | text | SÍ | — | — |

**61 permisos** organizados en 12 módulos. Ver `permissions.md` §3 para el catálogo completo.

### `rol_permisos`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `rol_id` | uuid | NO | — | FK roles, PK compuesta |
| `permiso_id` | uuid | NO | — | FK permisos, PK compuesta |

### `usuario_scopes`
Clave de RLS. Define el universo de datos visible por usuario.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `usuario_id` | uuid | NO | — | FK usuarios |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `tipo` | enum | NO | — | `global`, `candidato`, `barrio`, `supervisor` |
| `candidato_id` | uuid | SÍ | — | FK candidatos |
| `barrio_id` | uuid | SÍ | — | FK barrios |
| `supervisor_id` | uuid | SÍ | — | FK supervisores |
| `vigente_desde` | timestamptz | NO | now() | — |
| `vigente_hasta` | timestamptz | SÍ | — | — |

---

## B. Contexto electoral (7 tablas)

### `elecciones`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `nombre` | text | NO | — | — |
| `tipo` | enum | NO | — | `interna`, `municipal`, `general`, `otra` |
| `fecha` | date | NO | — | — |
| `estado` | enum | NO | 'planificacion' | `planificacion`, `activa`, `cerrada` |
| `municipio` | text | SÍ | — | — |
| `departamento` | text | SÍ | — | — |

**Registros reales:**
- Internas ANR Municipales — 2026-06-07 — `cerrada` (histórico)
- Día D Municipales Villa Hayes — 2026-10-04 — `activa` (operación actual)

### `barrios`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `codigo` | text | NO | — | — |
| `nombre` | text | NO | — | — |
| `municipio` | text | SÍ | — | — |
| `zona` | text | SÍ | — | — |
| `activo` | boolean | NO | true | — |

**23 barrios** detectados y normalizados.

### `locales_votacion`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `codigo` | integer | NO | — | UNIQUE |
| `nombre` | text | NO | — | — |
| `zona` | text | SÍ | — | — |
| `barrio_id` | uuid | SÍ | — | FK barrios |
| `direccion` | text | SÍ | — | — |

**7 locales** reales desde el padrón.

### `mesas`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `local_votacion_id` | uuid | NO | — | FK locales_votacion |
| `numero` | integer | NO | — | 1-20 |
| `eleccion_id` | uuid | SÍ | — | FK elecciones |
| `cantidad_electores` | integer | SÍ | — | — |

### `candidatos`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `persona_id` | uuid | NO | — | FK personas |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `tipo` | enum | NO | — | `concejal`, `intendente`, `otro` |
| `nombre_publico` | text | NO | — | — |
| `apodo` | text | SÍ | — | — |
| `lista` | text | SÍ | — | — |
| `orden_lista` | integer | SÍ | — | — |
| `preferenciales` | integer | SÍ | — | — |
| `activo` | boolean | NO | true | — |

**17 candidatos** detectados.

### `supervisores`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `persona_id` | uuid | NO | — | FK personas |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `candidato_id` | uuid | SÍ | — | FK candidatos |
| `alias` | text | SÍ | — | — |
| `activo` | boolean | NO | true | — |

**22 supervisores** detectados.

### `alias_catalogo`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `tipo` | enum | NO | — | `barrio`, `candidato`, `supervisor` |
| `entidad_id` | uuid | NO | — | — |
| `alias_texto` | text | NO | — | — |
| `origen` | text | SÍ | — | — |

UNIQUE `(tipo, alias_texto, organizacion_id)`. Mapea variantes de texto de las planillas.

---

## C. Padrón (3 tablas)

### `padron_snapshots`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `anio` | integer | NO | — | — |
| `fuente` | text | NO | — | — |
| `fecha_corte` | date | SÍ | — | — |
| `archivo_hash` | text | NO | — | — |
| `encoding` | text | NO | — | — |
| `filas` | integer | NO | — | — |
| `importado_por` | uuid | NO | — | FK usuarios |
| `fecha_import` | timestamptz | NO | now() | — |
| `vigente` | boolean | NO | true | — |

Transversal a organizaciones — dato público.

### `padron_electoral`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `snapshot_id` | uuid | NO | — | FK padron_snapshots |
| `ci` | text | NO | — | — |
| `nombre_completo` | text | NO | — | — |
| `apellidos` | text | SÍ | — | — |
| `nombres` | text | SÍ | — | — |
| `local_votacion_id` | uuid | SÍ | — | FK locales_votacion |
| `mesa` | integer | SÍ | — | — |
| `orden` | integer | SÍ | — | — |
| `direccion` | text | SÍ | — | — |
| `zona` | text | SÍ | — | — |
| `partidos` | text | SÍ | — | — |
| `seccional` | text | SÍ | — | — |

UNIQUE `(snapshot_id, ci)`. **Solo lectura** desde la aplicación. **35.192 filas**.

### `padron_participacion`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `snapshot_id` | uuid | NO | — | FK padron_snapshots |
| `ci` | text | NO | — | — |
| `eleccion_codigo` | text | NO | — | `jun2021`, `oct2021`, etc. |
| `voto` | char(1) | NO | — | `S` o `N` |

UNIQUE `(snapshot_id, ci, eleccion_codigo)`. Formato largo a propósito.

---

## D. Personas y choferes (5 tablas)

### `personas`
Raíz de identidad del sistema.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `ci` | text | **NO** | — | CHECK `'^[1-9][0-9]{4,8}$'` |
| `ci_original` | text | SÍ | — | Texto tal como vino |
| `nombres` | text | NO | — | — |
| `apellidos` | text | NO | — | — |
| `nombre_completo` | text | NO | — | GENERATED |
| `telefono_e164` | text | SÍ | — | CHECK `'^\+595[0-9]{9}$'` |
| `telefono_original` | text | SÍ | — | — |
| `barrio_residencia_id` | uuid | SÍ | — | FK barrios |
| `padron_ci` | text | SÍ | — | Verificación contra snapshot |
| `verificado_en_padron` | boolean | NO | false | Derivado |
| `estado_identidad` | enum | NO | — | `verificada`, `fuera_de_padron`, `discrepancia_nombre` |
| `observaciones` | text | SÍ | — | — |
| `created_at/updated_at/deleted_at` | timestamptz | — | — | — |
| `created_by/updated_by` | uuid | — | — | FK usuarios |

UNIQUE `(organizacion_id, ci)`. **CI obligatorio** (RN-10).

### `vehiculos`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `chapa` | text | NO | — | Normalizada |
| `categoria` | enum | NO | — | `automovil`, `camioneta`, `minibus`, `motocicleta` |
| `marca` | text | SÍ | — | — |
| `modelo` | text | SÍ | — | — |
| `anio` | integer | SÍ | — | — |
| `propietario_persona_id` | uuid | SÍ | — | FK personas |
| `observaciones` | text | SÍ | — | — |

### `choferes`
Participación de una persona en una elección. **NO es la persona.**

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `persona_id` | uuid | NO | — | FK personas |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `numero_orden` | integer | SÍ | — | — |
| `estado_servicio` | enum | NO | — | `contratado`, `voluntario`, `pendiente` |
| `estado` | enum | NO | 'borrador' | `borrador`, `activo`, `suspendido`, `baja` |
| `fecha_alta` | timestamptz | NO | now() | — |
| `dado_de_baja_en` | timestamptz | SÍ | — | — |
| `motivo_baja` | text | SÍ | — | — |
| `origen_planilla_id` | uuid | SÍ | — | FK origenes_planilla |
| `observaciones` | text | SÍ | — | — |
| `declarado_por` | uuid | **NO** | — | FK usuarios (RN-16) |
| `responsable_persona_id` | uuid | **NO** | — | FK personas (RN-16) |

UNIQUE parcial `(persona_id, eleccion_id) WHERE deleted_at IS NULL AND estado <> 'baja'` — un CI, una participación por elección.

### `chofer_vehiculos`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `chofer_id` | uuid | NO | — | FK choferes |
| `vehiculo_id` | uuid | NO | — | FK vehiculos |
| `principal` | boolean | NO | true | — |
| `desde` | timestamptz | NO | now() | — |
| `hasta` | timestamptz | SÍ | — | — |

UNIQUE parcial `(vehiculo_id) WHERE hasta IS NULL` — un vehículo, un chofer activo (RN-09).

### `asignaciones`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `chofer_id` | uuid | NO | — | FK choferes |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `candidato_id` | uuid | NO | — | FK candidatos |
| `barrio_id` | uuid | SÍ | — | FK barrios |
| `supervisor_id` | uuid | SÍ | — | FK supervisores |
| `vigente_desde` | timestamptz | NO | now() | — |
| `vigente_hasta` | timestamptz | SÍ | — | — |
| `motivo_cambio` | text | SÍ | — | — |
| `asignado_por` | uuid | NO | — | FK usuarios |

UNIQUE parcial `(chofer_id) WHERE vigente_hasta IS NULL` — una sola asignación vigente.

---

## E. Control (3 tablas)

### `lista_negra`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `persona_id` | uuid | NO | — | FK personas |
| `motivo_codigo` | enum motivo_lista_negra | NO | — | 8 valores |
| `motivo_detalle` | text | SÍ | — | Obligatorio si `otro` |
| `eleccion_origen_id` | uuid | SÍ | — | FK elecciones |
| `evidencia_url` | text | SÍ | — | — |
| `severidad` | enum | NO | — | `bloqueo_total`, `advertencia` |
| `vigente_desde` | timestamptz | NO | now() | — |
| `vigente_hasta` | timestamptz | SÍ | — | NULL = indefinido |
| `registrado_por` | uuid | NO | — | FK usuarios |
| `aprobado_por` | uuid | NO | — | FK usuarios |
| `revocado_en` | timestamptz | SÍ | — | — |
| `revocado_por` | uuid | SÍ | — | FK usuarios |
| `motivo_revocacion` | text | SÍ | — | — |

### `excepciones`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `persona_id` | uuid | SÍ | — | FK personas |
| `chofer_id` | uuid | SÍ | — | FK choferes |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `tipo` | enum | NO | — | `lista_negra`, `cupo`, `fuera_de_padron`, `doble_vehiculo`, `sin_actividad`, `otro` |
| `motivo` | text | NO | — | — |
| `solicitado_por` | uuid | NO | — | FK usuarios |
| `aprobado_por` | uuid | SÍ | — | FK usuarios, CHECK ≠ solicitado_por |
| `aprobado_en` | timestamptz | SÍ | — | — |
| `vence_en` | timestamptz | SÍ | — | — |
| `estado` | enum | NO | 'pendiente' | `pendiente`, `aprobada`, `rechazada`, `vencida` |
| `evidencia_url` | text | SÍ | — | — |

### `antecedentes`
| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `organizacion_id` | uuid | NO | — | FK organizaciones |
| `persona_id` | uuid | NO | — | FK personas |
| `eleccion_id` | uuid | NO | — | FK elecciones |
| `rol` | text | SÍ | — | — |
| `resultado` | enum | NO | — | `cumplio`, `no_cumplio`, `parcial`, `sin_datos` |
| `km_recorridos` | numeric | SÍ | — | — |
| `tuvo_gps` | boolean | SÍ | — | — |
| `anticipo_pagado` | boolean | SÍ | — | — |
| `pago_finalizado` | boolean | SÍ | — | — |
| `incidentes` | text | SÍ | — | — |
| `confiabilidad_dato` | enum | NO | — | `alta`, `media`, `baja` |
| `fuente` | text | NO | — | — |

---

## F–J. Tablas restantes

Las tablas de Cupos (F), Contratos y Caja (G), GPS (H), Datos y Trazabilidad (I), y Auditoría (J) están documentadas en detalle en `database.md` §3. Este diccionario complementa con los tipos exactos y constraints.

---

## Enums de PostgreSQL

```sql
-- Tipos de elección
CREATE TYPE tipo_eleccion AS ENUM ('interna', 'municipal', 'general', 'otra');
CREATE TYPE estado_eleccion AS ENUM ('planificacion', 'activa', 'cerrada');

-- Personas
CREATE TYPE estado_identidad AS ENUM ('verificada', 'fuera_de_padron', 'discrepancia_nombre');

-- Vehículos
CREATE TYPE categoria_vehiculo AS ENUM ('automovil', 'camioneta', 'minibus', 'motocicleta');

-- Choferes
CREATE TYPE estado_servicio AS ENUM ('contratado', 'voluntario', 'pendiente');
CREATE TYPE estado_chofer AS ENUM ('borrador', 'activo', 'suspendido', 'baja');

-- Lista negra
CREATE TYPE motivo_lista_negra AS ENUM (
  'incumplio_operativo', 'cobro_sin_servicio', 'documentacion_falsa',
  'vehiculo_no_habilitado', 'conducta', 'doble_imputacion',
  'a_pedido_de_la_persona', 'otro'
);
CREATE TYPE severidad_lista_negra AS ENUM ('bloqueo_total', 'advertencia');

-- Excepciones
CREATE TYPE tipo_excepcion AS ENUM (
  'lista_negra', 'cupo', 'fuera_de_padron', 'doble_vehiculo', 'sin_actividad', 'otro'
);
CREATE TYPE estado_excepcion AS ENUM ('pendiente', 'aprobada', 'rechazada', 'vencida');

-- Cupos
CREATE TYPE ambito_cupo AS ENUM ('candidato', 'barrio', 'supervisor', 'global');

-- Caja
CREATE TYPE tipo_documento_folio AS ENUM ('contrato', 'vale_combustible', 'anticipo', 'pago_final');
CREATE TYPE estado_folio AS ENUM ('disponible', 'asignado', 'usado', 'anulado');
CREATE TYPE estado_documento AS ENUM ('pendiente', 'firmado', 'anulado');

-- GPS
CREATE TYPE estado_dispositivo AS ENUM ('pendiente_alta', 'activo', 'inactivo', 'baja');
CREATE TYPE clasificacion_actividad AS ENUM ('activo', 'inactivo', 'sin_dispositivo', 'sin_datos');

-- Scopes
CREATE TYPE tipo_scope AS ENUM ('global', 'candidato', 'barrio', 'supervisor');

-- Importación
CREATE TYPE tipo_origen AS ENUM ('excel', 'google_sheets', 'carga_manual', 'api', 'contingencia_papel');
CREATE TYPE estado_importacion_fila AS ENUM ('ok', 'error', 'conflicto', 'omitida', 'aplicada', 'rechazada');

-- Resultado de antecedentes
CREATE TYPE resultado_antecedente AS ENUM ('cumplio', 'no_cumplio', 'parcial', 'sin_datos');
CREATE TYPE confiabilidad_dato AS ENUM ('alta', 'media', 'baja');
```

---

## Funciones RPC

| Función | Responsabilidad | Security |
|---|---|---|
| `fn_alta_chofer(payload jsonb)` | Valida CI, padrón, lista negra, cupo en cascada, duplicado; crea persona/chofer/asignación; registra aparición; consume cupos | `security definer` |
| `fn_consumir_cupo_cascada(...)` | Bloquea y verifica los tres ámbitos (FOR UPDATE) | `security definer` |
| `fn_asignar_folio(serie_id, doc_tipo, doc_id)` | Siguiente folio con `FOR UPDATE SKIP LOCKED` | `security definer` |
| `fn_verificar_padron(ci)` | Presencia, local, mesa, dirección; registra acceso | `security definer` |
| `fn_recalcular_actividad(...)` | Reconstruye `actividad_diaria` desde eventos | `security definer` |
| `fn_confirmar_importacion(importacion_id)` | Aplica filas ok + conflictos resueltos | `security definer` |
| `fn_normalizar_ci(text)` | Solo dígitos, sin ceros | `stable` |
| `fn_normalizar_telefono(text)` | E.164 | `stable` |
| `auth_usuario_id()` | auth.uid() | `stable, security definer` |
| `auth_organizacion_id()` | Organización del usuario | `stable, security definer` |
| `auth_es_admin()` | ¿Es admin? | `stable, security definer` |
| `auth_tiene_permiso(codigo)` | ¿Tiene permiso? | `stable, security definer` |
| `auth_eleccion_actual()` | Elección activa | `stable, security definer` |
| `auth_candidatos_visibles()` | Set de UUIDs desde scopes | `stable, security definer` |
| `auth_barrios_visibles()` | Set de UUIDs desde scopes | `stable, security definer` |
| `auth_supervisores_visibles()` | Set de UUIDs desde scopes | `stable, security definer` |

Todas las `security definer` con `set search_path = public, pg_temp`.
