-- =====================================================================
-- 0001 · Base: extensiones, enums, organizaciones, acceso
-- Sistema de gestión de choferes — Logística Día D, Villa Hayes
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------
-- Enums de dominio
-- ---------------------------------------------------------------------
create type eleccion_tipo      as enum ('interna','municipal','general','otra');
create type eleccion_estado    as enum ('planificacion','activa','cerrada');
create type candidato_tipo     as enum ('concejal','intendente','otro');
create type alias_tipo         as enum ('barrio','candidato','supervisor');

create type estado_identidad   as enum ('verificada','fuera_de_padron','discrepancia_nombre');
create type vehiculo_categoria as enum ('automovil','camioneta','minibus','motocicleta');
create type estado_servicio    as enum ('contratado','voluntario','pendiente');
create type chofer_estado      as enum ('borrador','activo','suspendido','baja');

-- D-06: catálogo cerrado de motivos de lista negra
create type motivo_lista_negra as enum (
  'incumplio_operativo',
  'cobro_sin_servicio',
  'documentacion_falsa',
  'vehiculo_no_habilitado',
  'conducta',
  'doble_imputacion',
  'a_pedido_de_la_persona',
  'otro'
);
create type lista_negra_severidad as enum ('bloqueo_total','advertencia');

create type excepcion_tipo     as enum ('lista_negra','cupo','fuera_de_padron','doble_vehiculo','sin_actividad','otro');
create type excepcion_estado   as enum ('pendiente','aprobada','rechazada','vencida');
create type antecedente_res    as enum ('cumplio','no_cumplio','parcial','sin_datos');
create type confiabilidad      as enum ('alta','media','baja');
create type cupo_ambito        as enum ('candidato','barrio','supervisor','global');

create type documento_tipo     as enum ('contrato','vale_combustible','anticipo','pago_final');
create type folio_serie_estado as enum ('disponible','en_uso','agotada','anulada');
create type folio_estado       as enum ('disponible','asignado','usado','anulado');
create type documento_estado   as enum ('pendiente','firmado','entregado','pagado','finalizado','anulado');
create type movimiento_tipo    as enum ('ingreso','egreso');
create type arqueo_estado      as enum ('abierto','cerrado');

create type dispositivo_estado as enum ('pendiente_alta','activo','inactivo','baja');
create type actividad_clase    as enum ('activo','inactivo','sin_dispositivo','sin_datos');

create type origen_tipo        as enum ('excel','google_sheets','carga_manual','api','contingencia_papel');
create type importacion_estado as enum ('cargando','validado','confirmado','revertido','fallido');
create type fila_estado        as enum ('ok','error','conflicto','omitida','aplicada','rechazada');
create type export_formato     as enum ('pdf','xlsx','csv');
create type recurso_sensible   as enum ('padron','lista_negra','caja','pii');
create type acceso_accion      as enum ('consulta','exportacion');
create type scope_tipo         as enum ('global','candidato','barrio','supervisor');

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Normalización de CI: sólo dígitos, sin ceros a la izquierda.
--
-- Cuidado con el orden: Excel entrega las cédulas como '4349952.0'. Si se
-- quitan los no-dígitos primero, ese '.0' final se convierte en un cero
-- pegado al número y 4349952 termina siendo 43499820. Por eso la parte
-- decimal se elimina ANTES. El padrón, en cambio, trae '32.713' con punto
-- de miles, que sí debe colapsarse a 32713.
create or replace function fn_normalizar_ci(p text) returns text
language sql immutable as $$
  select nullif(
           ltrim(
             regexp_replace(
               regexp_replace(btrim(coalesce(p,'')), '[.,]0+$', ''),  -- '.0' de Excel
               '[^0-9]', '', 'g'),                                    -- puntos de miles, guiones
           '0'),                                                      -- ceros a la izquierda
         '')
$$;

-- Normalización de teléfono paraguayo a E.164 (+595XXXXXXXXX).
create or replace function fn_normalizar_telefono(p text) returns text
language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(p,''), '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if left(d,3) = '595' then d := substr(d,4);
  elsif left(d,1) = '0'  then d := substr(d,2);
  end if;
  if length(d) <> 9 then return null; end if;   -- los truncados quedan nulos
  return '+595' || d;
end $$;

-- Nombre normalizado para búsqueda difusa (sin tildes, mayúsculas).
create or replace function fn_normalizar_nombre(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(unaccent(coalesce(p,'')), '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- A. Organización y acceso
-- ---------------------------------------------------------------------
create table organizaciones (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  activo        boolean not null default true,
  configuracion jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id),
  email           text not null,
  nombre_completo text not null,
  persona_id      uuid,                       -- FK diferida a personas
  activo          boolean not null default true,
  mfa_habilitado  boolean not null default false,
  ultimo_acceso   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index ix_usuarios_org on usuarios(organizacion_id);

create table roles (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  nivel       int  not null default 0
);

create table permisos (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  modulo      text not null,
  descripcion text
);

create table rol_permisos (
  rol_id     uuid not null references roles(id) on delete cascade,
  permiso_id uuid not null references permisos(id) on delete cascade,
  primary key (rol_id, permiso_id)
);

create table usuario_roles (
  usuario_id      uuid not null references usuarios(id) on delete cascade,
  rol_id          uuid not null references roles(id),
  organizacion_id uuid not null references organizaciones(id),
  eleccion_id     uuid,                       -- null = vale para toda la organización
  created_at      timestamptz not null default now(),
  primary key (usuario_id, rol_id, organizacion_id)
);
create index ix_usuario_roles_usuario on usuario_roles(usuario_id, organizacion_id);

create table usuario_scopes (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references usuarios(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id),
  eleccion_id     uuid,
  tipo            scope_tipo not null,
  candidato_id    uuid,
  barrio_id       uuid,
  supervisor_id   uuid,
  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,
  created_at      timestamptz not null default now(),
  constraint ck_scope_coherente check (
    (tipo = 'global'     and candidato_id is null and barrio_id is null and supervisor_id is null) or
    (tipo = 'candidato'  and candidato_id is not null) or
    (tipo = 'barrio'     and barrio_id    is not null) or
    (tipo = 'supervisor' and supervisor_id is not null)
  )
);
create index ix_scopes_usuario on usuario_scopes(usuario_id, organizacion_id, eleccion_id);

create trigger tg_org_upd  before update on organizaciones for each row execute function fn_set_updated_at();
create trigger tg_usr_upd  before update on usuarios       for each row execute function fn_set_updated_at();
