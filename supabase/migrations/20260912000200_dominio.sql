-- =====================================================================
-- 0002 · Dominio: contexto electoral, padrón, personas, choferes,
--        control y cupos
-- =====================================================================

-- ---------------------------------------------------------------------
-- B. Contexto electoral
-- ---------------------------------------------------------------------
create table elecciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  nombre          text not null,
  tipo            eleccion_tipo not null,
  fecha           date not null,
  estado          eleccion_estado not null default 'planificacion',
  municipio       text not null default 'Villa Hayes',
  departamento    text not null default 'Presidente Hayes',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organizacion_id, nombre, fecha)
);
create index ix_elecciones_org on elecciones(organizacion_id, estado);

create table locales_votacion (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,
  nombre       text not null,
  zona         text,
  direccion    text,
  created_at   timestamptz not null default now()
);

create table barrios (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  codigo          text,
  nombre          text not null,
  municipio       text not null default 'Villa Hayes',
  zona            text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organizacion_id, nombre)
);

create table mesas (
  id                 uuid primary key default gen_random_uuid(),
  local_votacion_id  uuid not null references locales_votacion(id),
  numero             int  not null,
  eleccion_id        uuid references elecciones(id),
  cantidad_electores int,
  unique (local_votacion_id, numero, eleccion_id)
);

-- personas se crea más abajo; candidatos y supervisores la referencian,
-- así que las FK se agregan al final del archivo.
create table candidatos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  eleccion_id     uuid not null references elecciones(id),
  persona_id      uuid,
  tipo            candidato_tipo not null default 'concejal',
  nombre_publico  text not null,
  apodo           text,
  lista           text,
  orden_lista     int,
  preferenciales  int,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organizacion_id, eleccion_id, nombre_publico)
);
create index ix_candidatos_eleccion on candidatos(eleccion_id, activo);

create table supervisores (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  eleccion_id     uuid not null references elecciones(id),
  persona_id      uuid,
  candidato_id    uuid references candidatos(id),
  alias           text not null,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organizacion_id, eleccion_id, alias)
);

-- Mapea las variantes de texto de las planillas al catálogo real.
create table alias_catalogo (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  tipo            alias_tipo not null,
  entidad_id      uuid not null,
  alias_texto     text not null,
  origen          text,
  created_at      timestamptz not null default now(),
  unique (organizacion_id, tipo, alias_texto)
);

-- ---------------------------------------------------------------------
-- C. Padrón  (transversal a organizaciones: es dato público)
-- ---------------------------------------------------------------------
create table padron_snapshots (
  id            uuid primary key default gen_random_uuid(),
  anio          int  not null,
  fuente        text not null,
  fecha_corte   date,
  archivo_hash  text not null unique,
  encoding      text not null default 'UTF-8',
  filas         int  not null default 0,
  importado_por uuid references usuarios(id),
  fecha_import  timestamptz not null default now(),
  vigente       boolean not null default false
);
create unique index ux_padron_vigente on padron_snapshots(vigente) where vigente;

create table padron_electoral (
  id                uuid primary key default gen_random_uuid(),
  snapshot_id       uuid not null references padron_snapshots(id) on delete cascade,
  ci                text not null,
  nombre_completo   text not null,
  apellidos         text,
  nombres           text,
  local_votacion_id uuid references locales_votacion(id),
  mesa              int,
  orden             int,
  direccion         text,
  zona              text,
  partidos          text,
  seccional         text
);
create unique index ux_padron_snapshot_ci on padron_electoral(snapshot_id, ci);
create index ix_padron_ci on padron_electoral(ci);
create index ix_padron_nombre_trgm on padron_electoral using gin (nombre_completo gin_trgm_ops);

-- Formato largo: el padrón trae 5 elecciones hoy y va a traer más.
create table padron_participacion (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid not null references padron_snapshots(id) on delete cascade,
  ci              text not null,
  eleccion_codigo text not null,          -- 'jun2021','oct2021','dic2022','abr2023','jun2026'
  voto            char(1) not null check (voto in ('S','N'))
);
create unique index ux_padron_part on padron_participacion(snapshot_id, ci, eleccion_codigo);

-- ---------------------------------------------------------------------
-- D. Personas, vehículos, choferes, asignaciones
-- ---------------------------------------------------------------------
create table personas (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references organizaciones(id),
  ci                   text not null,                       -- D-18: obligatorio
  ci_original          text,
  nombres              text not null,
  apellidos            text not null default '',
  nombre_completo      text generated always as (btrim(nombres || ' ' || apellidos)) stored,
  telefono_e164        text,
  telefono_original    text,
  barrio_residencia_id uuid references barrios(id),
  padron_ci            text,
  verificado_en_padron boolean not null default false,
  estado_identidad     estado_identidad not null default 'fuera_de_padron',
  observaciones        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  created_by           uuid references usuarios(id),
  updated_by           uuid references usuarios(id),
  constraint ck_ci_formato  check (ci ~ '^[1-9][0-9]{4,8}$'),
  constraint ck_telefono    check (telefono_e164 is null or telefono_e164 ~ '^\+595[0-9]{9}$')
);
create unique index ux_personas_ci on personas(organizacion_id, ci) where deleted_at is null;
create index ix_personas_nombre_trgm on personas using gin (nombre_completo gin_trgm_ops);
create index ix_personas_telefono on personas(telefono_e164);

alter table usuarios     add constraint fk_usuarios_persona     foreign key (persona_id)    references personas(id);
alter table candidatos   add constraint fk_candidatos_persona   foreign key (persona_id)    references personas(id);
alter table supervisores add constraint fk_supervisores_persona foreign key (persona_id)    references personas(id);
alter table usuario_scopes add constraint fk_scope_candidato    foreign key (candidato_id)  references candidatos(id);
alter table usuario_scopes add constraint fk_scope_barrio       foreign key (barrio_id)     references barrios(id);
alter table usuario_scopes add constraint fk_scope_supervisor   foreign key (supervisor_id) references supervisores(id);

create table vehiculos (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references organizaciones(id),
  chapa                  text,
  categoria              vehiculo_categoria,
  marca                  text,
  modelo                 text,
  anio                   int,
  propietario_persona_id uuid references personas(id),
  observaciones          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create unique index ux_vehiculo_chapa on vehiculos(organizacion_id, chapa) where chapa is not null and deleted_at is null;

create table choferes (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references organizaciones(id),
  persona_id            uuid not null references personas(id),
  eleccion_id           uuid not null references elecciones(id),
  numero_orden          int,
  estado_servicio       estado_servicio not null default 'pendiente',
  estado                chofer_estado   not null default 'borrador',
  fecha_alta            timestamptz not null default now(),
  dado_de_baja_en       timestamptz,
  motivo_baja           text,
  origen_planilla_id    uuid,
  observaciones         text,
  -- D-14 / RN-16: todo chofer tiene un responsable declarado
  declarado_por         uuid not null references usuarios(id),
  responsable_persona_id uuid not null references personas(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  created_by            uuid references usuarios(id),
  updated_by            uuid references usuarios(id)
);
-- La restricción que hace imposible repetir los 64 CI duplicados:
create unique index ux_chofer_persona_eleccion
  on choferes(persona_id, eleccion_id)
  where deleted_at is null and estado <> 'baja';
create index ix_choferes_eleccion on choferes(organizacion_id, eleccion_id, estado);
create index ix_choferes_responsable on choferes(responsable_persona_id);

create table chofer_vehiculos (
  id          uuid primary key default gen_random_uuid(),
  chofer_id   uuid not null references choferes(id) on delete cascade,
  vehiculo_id uuid not null references vehiculos(id),
  principal   boolean not null default true,
  desde       timestamptz not null default now(),
  hasta       timestamptz
);
create unique index ux_vehiculo_activo on chofer_vehiculos(vehiculo_id) where hasta is null;
create index ix_chofer_vehiculos on chofer_vehiculos(chofer_id);

create table asignaciones (
  id            uuid primary key default gen_random_uuid(),
  chofer_id     uuid not null references choferes(id) on delete cascade,
  eleccion_id   uuid not null references elecciones(id),
  candidato_id  uuid not null references candidatos(id),
  barrio_id     uuid references barrios(id),
  supervisor_id uuid references supervisores(id),
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  motivo_cambio text,
  asignado_por  uuid references usuarios(id),
  created_at    timestamptz not null default now()
);
-- D-17: una sola asignación vigente por chofer
create unique index ux_asignacion_vigente on asignaciones(chofer_id) where vigente_hasta is null;
create index ix_asignaciones_candidato  on asignaciones(candidato_id, eleccion_id);
create index ix_asignaciones_barrio     on asignaciones(barrio_id);
create index ix_asignaciones_supervisor on asignaciones(supervisor_id);

-- ---------------------------------------------------------------------
-- E. Control: lista negra, excepciones, antecedentes
-- ---------------------------------------------------------------------
create table lista_negra (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones(id),
  persona_id         uuid not null references personas(id),
  motivo_codigo      motivo_lista_negra not null,
  motivo_detalle     text,
  eleccion_origen_id uuid references elecciones(id),
  evidencia_url      text,
  severidad          lista_negra_severidad not null default 'bloqueo_total',
  vigente_desde      timestamptz not null default now(),
  vigente_hasta      timestamptz,                -- null = indefinido (D-06 + D-10)
  registrado_por     uuid not null references usuarios(id),
  aprobado_por       uuid references usuarios(id),
  revocado_en        timestamptz,
  revocado_por       uuid references usuarios(id),
  motivo_revocacion  text,
  created_at         timestamptz not null default now(),
  constraint ck_motivo_detalle
    check (motivo_codigo <> 'otro' or nullif(btrim(motivo_detalle), '') is not null),
  constraint ck_revocacion
    check (revocado_en is null or nullif(btrim(motivo_revocacion), '') is not null)
);
create index ix_lista_negra_persona on lista_negra(persona_id);

create table excepciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  persona_id      uuid references personas(id),
  chofer_id       uuid references choferes(id),
  eleccion_id     uuid not null references elecciones(id),
  tipo            excepcion_tipo not null,
  motivo          text not null,
  solicitado_por  uuid not null references usuarios(id),
  aprobado_por    uuid references usuarios(id),
  aprobado_en     timestamptz,
  vence_en        timestamptz,
  estado          excepcion_estado not null default 'pendiente',
  evidencia_url   text,
  created_at      timestamptz not null default now(),
  -- El aprobador nunca puede ser el solicitante
  constraint ck_excepcion_aprobador
    check (estado <> 'aprobada' or (aprobado_por is not null and aprobado_por <> solicitado_por))
);
create index ix_excepciones_estado on excepciones(organizacion_id, eleccion_id, estado);

create table antecedentes (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones(id),
  persona_id         uuid not null references personas(id),
  eleccion_id        uuid not null references elecciones(id),
  rol                text not null default 'chofer',
  resultado          antecedente_res not null default 'sin_datos',
  km_recorridos      numeric(10,2),
  tuvo_gps           boolean not null default false,
  anticipo_pagado    boolean,
  pago_finalizado    boolean,
  incidentes         text,
  confiabilidad_dato confiabilidad not null default 'alta',
  fuente             text,
  created_at         timestamptz not null default now(),
  unique (persona_id, eleccion_id, rol)
);

-- ---------------------------------------------------------------------
-- F. Cupos (D-05: los tres ámbitos en cascada)
-- ---------------------------------------------------------------------
create table cupos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  eleccion_id     uuid not null references elecciones(id),
  ambito          cupo_ambito not null,
  candidato_id    uuid references candidatos(id),
  barrio_id       uuid references barrios(id),
  supervisor_id   uuid references supervisores(id),
  limite          int not null check (limite >= 0),
  definido_por    uuid references usuarios(id),
  vigente_desde   timestamptz not null default now(),
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ck_cupo_ambito check (
    (ambito = 'global'     and candidato_id is null and barrio_id is null and supervisor_id is null) or
    (ambito = 'candidato'  and candidato_id is not null) or
    (ambito = 'barrio'     and barrio_id    is not null) or
    (ambito = 'supervisor' and supervisor_id is not null)
  )
);
create unique index ux_cupo_unico on cupos(
  eleccion_id, ambito,
  coalesce(candidato_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(barrio_id,     '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(supervisor_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table cupo_movimientos (
  id             uuid primary key default gen_random_uuid(),
  cupo_id        uuid not null references cupos(id) on delete cascade,
  chofer_id      uuid not null references choferes(id) on delete cascade,
  delta          int  not null check (delta in (-1, 1)),
  motivo         text,
  excepcion_id   uuid references excepciones(id),
  registrado_por uuid references usuarios(id),
  created_at     timestamptz not null default now()
);
create index ix_cupo_mov on cupo_movimientos(cupo_id);
create index ix_cupo_mov_chofer on cupo_movimientos(chofer_id);

create trigger tg_personas_upd  before update on personas  for each row execute function fn_set_updated_at();
create trigger tg_choferes_upd  before update on choferes  for each row execute function fn_set_updated_at();
create trigger tg_vehiculos_upd before update on vehiculos for each row execute function fn_set_updated_at();
create trigger tg_barrios_upd   before update on barrios   for each row execute function fn_set_updated_at();
create trigger tg_cupos_upd     before update on cupos     for each row execute function fn_set_updated_at();
