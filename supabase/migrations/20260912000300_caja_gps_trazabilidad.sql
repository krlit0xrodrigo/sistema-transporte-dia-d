-- =====================================================================
-- 0003 · Folios y caja, GPS, trazabilidad y auditoría
-- =====================================================================

-- ---------------------------------------------------------------------
-- G. Folios y caja  (D-09: marca de firma · D-16: montos opcionales)
-- ---------------------------------------------------------------------
create table folios_series (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references organizaciones(id),
  eleccion_id          uuid not null references elecciones(id),
  tipo_documento       documento_tipo not null,
  prefijo              text not null default '',
  desde                int not null check (desde > 0),
  hasta                int not null,
  asignado_a_usuario_id uuid references usuarios(id),
  estado               folio_serie_estado not null default 'disponible',
  created_at           timestamptz not null default now(),
  constraint ck_rango check (hasta >= desde)
);

create table folios (
  id                   uuid primary key default gen_random_uuid(),
  serie_id             uuid not null references folios_series(id) on delete cascade,
  numero               int  not null,
  numero_completo      text generated always as (numero::text) stored,
  estado               folio_estado not null default 'disponible',
  documento_tipo       documento_tipo,
  documento_id         uuid,
  asignado_a_usuario_id uuid references usuarios(id),
  usado_en             timestamptz,
  anulado_en           timestamptz,
  motivo_anulacion     text,
  constraint ck_folio_documento check ((estado = 'usado') = (documento_id is not null)),
  constraint ck_folio_anulacion check (anulado_en is null or nullif(btrim(motivo_anulacion),'') is not null)
);
create unique index ux_folio_serie_numero on folios(serie_id, numero);
create index ix_folios_disponibles on folios(serie_id, estado) where estado = 'disponible';

create table contratos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  chofer_id       uuid not null references choferes(id) on delete cascade,
  eleccion_id     uuid not null references elecciones(id),
  folio_id        uuid references folios(id),
  firmado         boolean not null default false,
  fecha_firma     timestamptz,
  registrado_por  uuid references usuarios(id),
  monto_acordado  numeric(14,0),                -- opcional (D-16)
  estado          documento_estado not null default 'pendiente',
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ck_contrato_firma check (firmado = false or (fecha_firma is not null and registrado_por is not null))
);
create unique index ux_contrato_vigente on contratos(chofer_id, eleccion_id) where estado <> 'anulado';

create table vales_combustible (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  chofer_id       uuid not null references choferes(id) on delete cascade,
  eleccion_id     uuid not null references elecciones(id),
  folio_id        uuid references folios(id),
  entregado       boolean not null default false,
  fecha_entrega   timestamptz,
  entregado_por   uuid references usuarios(id),
  monto           numeric(14,0),
  litros          numeric(8,2),
  estacion        text,
  estado          documento_estado not null default 'pendiente',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ck_vale_entrega check (entregado = false or (fecha_entrega is not null and entregado_por is not null))
);
create index ix_vales_chofer on vales_combustible(chofer_id);

create table anticipos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  chofer_id       uuid not null references choferes(id) on delete cascade,
  eleccion_id     uuid not null references elecciones(id),
  folio_id        uuid references folios(id),
  pagado          boolean not null default false,
  fecha_pago      timestamptz,
  pagado_por      uuid references usuarios(id),
  monto           numeric(14,0),
  estado          documento_estado not null default 'pendiente',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ck_anticipo_pago check (pagado = false or (fecha_pago is not null and pagado_por is not null))
);
create unique index ux_anticipo_chofer on anticipos(chofer_id, eleccion_id) where estado <> 'anulado';

create table pagos_finales (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references organizaciones(id),
  chofer_id           uuid not null references choferes(id) on delete cascade,
  eleccion_id         uuid not null references elecciones(id),
  folio_id            uuid references folios(id),
  finalizado          boolean not null default false,
  fecha_finalizacion  timestamptz,
  autorizado_por      uuid references usuarios(id),
  registrado_por      uuid references usuarios(id),
  monto               numeric(14,0),
  basado_en_actividad boolean not null default false,
  excepcion_id        uuid references excepciones(id),
  estado              documento_estado not null default 'pendiente',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ck_pago_final check (finalizado = false or (fecha_finalizacion is not null and registrado_por is not null))
);
-- Doble pago imposible:
create unique index ux_pago_final_chofer on pagos_finales(chofer_id, eleccion_id) where estado <> 'anulado';

-- Append-only: una corrección es un contramovimiento.
create table movimientos_caja (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references organizaciones(id),
  eleccion_id           uuid not null references elecciones(id),
  fecha                 date not null default current_date,
  tipo                  movimiento_tipo not null,
  concepto              text not null,
  monto                 numeric(14,0) not null check (monto > 0),
  documento_tipo        documento_tipo,
  documento_id          uuid,
  responsable_usuario_id uuid not null references usuarios(id),
  observaciones         text,
  created_at            timestamptz not null default now()
);
create index ix_mov_caja on movimientos_caja(organizacion_id, eleccion_id, fecha);

create table arqueos (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references organizaciones(id),
  eleccion_id           uuid not null references elecciones(id),
  responsable_usuario_id uuid not null references usuarios(id),
  fecha                 date not null default current_date,
  saldo_inicial         numeric(14,0) not null default 0,
  ingresos              numeric(14,0) not null default 0,
  egresos               numeric(14,0) not null default 0,
  saldo_teorico         numeric(14,0) generated always as (saldo_inicial + ingresos - egresos) stored,
  saldo_declarado       numeric(14,0),
  diferencia            numeric(14,0) generated always as (coalesce(saldo_declarado,0) - (saldo_inicial + ingresos - egresos)) stored,
  estado                arqueo_estado not null default 'abierto',
  observaciones         text,
  created_at            timestamptz not null default now(),
  unique (eleccion_id, responsable_usuario_id, fecha)
);

-- ---------------------------------------------------------------------
-- H. GPS  (D-04: sin umbral · el vínculo es una FK, nunca un nombre)
-- ---------------------------------------------------------------------
create table dispositivos_gps (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references organizaciones(id),
  traccar_device_id int,
  unique_id         text,
  nombre            text,
  chofer_id         uuid references choferes(id),
  vehiculo_id       uuid references vehiculos(id),
  eleccion_id       uuid not null references elecciones(id),
  estado            dispositivo_estado not null default 'pendiente_alta',
  alta_en           timestamptz,
  baja_en           timestamptz,
  ultimo_contacto   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index ux_disp_traccar on dispositivos_gps(traccar_device_id) where traccar_device_id is not null;
create unique index ux_disp_unique  on dispositivos_gps(unique_id) where unique_id is not null;
create unique index ux_disp_chofer  on dispositivos_gps(chofer_id, eleccion_id) where chofer_id is not null and estado <> 'baja';

create table traccar_eventos (
  id               bigserial primary key,
  dispositivo_id   uuid not null references dispositivos_gps(id) on delete cascade,
  eleccion_id      uuid not null references elecciones(id),
  traccar_event_id bigint,
  tipo             text not null,
  ocurrido_en      timestamptz not null,
  lat              double precision,
  lng              double precision,
  velocidad        numeric(8,2),
  atributos        jsonb not null default '{}'::jsonb,
  ingerido_en      timestamptz not null default now()
);
create index ix_eventos_disp on traccar_eventos(dispositivo_id, ocurrido_en desc);
create unique index ux_evento_traccar on traccar_eventos(traccar_event_id) where traccar_event_id is not null;

create table actividad_diaria (
  id                  uuid primary key default gen_random_uuid(),
  chofer_id           uuid not null references choferes(id) on delete cascade,
  eleccion_id         uuid not null references elecciones(id),
  fecha               date not null,
  km_recorridos       numeric(10,2) not null default 0,
  primer_evento       timestamptz,
  ultimo_evento       timestamptz,
  eventos_movimiento  int not null default 0,
  eventos_pasivos     int not null default 0,
  clasificacion       actividad_clase not null default 'sin_datos',
  criterio_version    text not null default 'v1_movimiento',
  calculado_en        timestamptz not null default now(),
  unique (chofer_id, fecha, criterio_version)
);
create index ix_actividad_chofer on actividad_diaria(chofer_id, fecha);

-- ---------------------------------------------------------------------
-- I. Trazabilidad
-- ---------------------------------------------------------------------
create table origenes_planilla (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  codigo          text not null,
  nombre          text not null,
  tipo            origen_tipo not null,
  descripcion     text,
  activo          boolean not null default true,
  unique (organizacion_id, codigo)
);
alter table choferes add constraint fk_chofer_origen
  foreign key (origen_planilla_id) references origenes_planilla(id);

create table importaciones (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones(id),
  origen_planilla_id uuid references origenes_planilla(id),
  archivo_nombre     text not null,
  archivo_hash       text not null,
  hoja               text,
  filas_totales      int not null default 0,
  filas_ok           int not null default 0,
  filas_error        int not null default 0,
  filas_conflicto    int not null default 0,
  estado             importacion_estado not null default 'cargando',
  importado_por      uuid references usuarios(id),
  confirmado_por     uuid references usuarios(id),
  confirmado_en      timestamptz,
  resumen            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (organizacion_id, archivo_hash, hoja)
);

create table importacion_filas (
  id                  uuid primary key default gen_random_uuid(),
  importacion_id      uuid not null references importaciones(id) on delete cascade,
  numero_fila         int not null,
  datos_crudos        jsonb not null,
  datos_normalizados  jsonb,
  estado              fila_estado not null default 'ok',
  errores             jsonb not null default '[]'::jsonb,
  entidad_tipo        text,
  entidad_id          uuid,
  resuelto_por        uuid references usuarios(id),
  resolucion          text,
  unique (importacion_id, numero_fila)
);
create index ix_filas_estado on importacion_filas(importacion_id, estado);

-- D-03: cada vez que un CI figura en una planilla queda archivado, se aplique o no.
create table apariciones_origen (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones(id),
  persona_id         uuid not null references personas(id) on delete cascade,
  eleccion_id        uuid not null references elecciones(id),
  importacion_id     uuid references importaciones(id),
  origen_planilla_id uuid references origenes_planilla(id),
  hoja               text,
  numero_fila        int,
  nombre_texto       text,
  candidato_texto    text,
  barrio_texto       text,
  supervisor_texto   text,
  estado_texto       text,
  fue_aplicada       boolean not null default false,
  detectado_en       timestamptz not null default now()
);
create index ix_apariciones_persona on apariciones_origen(persona_id, eleccion_id);

create table exportaciones (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id),
  usuario_id      uuid not null references usuarios(id),
  tipo            text not null,
  formato         export_formato not null,
  filtros         jsonb not null default '{}'::jsonb,
  filas           int not null default 0,
  incluye_pii     boolean not null default false,
  archivo_url     text,
  created_at      timestamptz not null default now()
);
create index ix_export_usuario on exportaciones(usuario_id, created_at desc);

-- ---------------------------------------------------------------------
-- J. Auditoría  (append-only)
-- ---------------------------------------------------------------------
create table audit_log (
  id                 bigserial primary key,
  organizacion_id    uuid,
  tabla              text not null,
  registro_id        uuid,
  operacion          text not null,
  datos_anteriores   jsonb,
  datos_nuevos       jsonb,
  campos_modificados text[],
  usuario_id         uuid,
  rol_efectivo       text,
  ip                 inet,
  user_agent         text,
  ocurrido_en        timestamptz not null default now()
);
create index ix_audit_tabla on audit_log(tabla, registro_id);
create index ix_audit_fecha on audit_log(ocurrido_en desc);
create index ix_audit_org   on audit_log(organizacion_id, ocurrido_en desc);

create table accesos_sensibles (
  id              bigserial primary key,
  organizacion_id uuid,
  usuario_id      uuid references usuarios(id),
  recurso         recurso_sensible not null,
  entidad_id      uuid,
  accion          acceso_accion not null default 'consulta',
  contexto        jsonb not null default '{}'::jsonb,
  ocurrido_en     timestamptz not null default now()
);
create index ix_accesos_usuario on accesos_sensibles(usuario_id, ocurrido_en desc);

-- ---------------------------------------------------------------------
-- Trigger genérico de auditoría
-- ---------------------------------------------------------------------
create or replace function fn_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_old jsonb;
  v_new jsonb;
  v_campos text[];
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;

  begin
    v_org := coalesce((v_new->>'organizacion_id')::uuid, (v_old->>'organizacion_id')::uuid);
  exception when others then v_org := null;
  end;

  if tg_op = 'UPDATE' then
    select array_agg(key) into v_campos
    from jsonb_each(v_new) n
    where n.value is distinct from v_old->n.key;
  end if;

  insert into audit_log(organizacion_id, tabla, registro_id, operacion,
                        datos_anteriores, datos_nuevos, campos_modificados, usuario_id)
  values (v_org, tg_table_name,
          coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid),
          tg_op, v_old, v_new, v_campos, auth.uid());

  return coalesce(new, old);
end $$;

-- Aplica el trigger a todas las tablas de dominio.
do $$
declare t text;
begin
  foreach t in array array[
    'organizaciones','usuarios','usuario_roles','usuario_scopes',
    'elecciones','barrios','candidatos','supervisores','alias_catalogo',
    'personas','vehiculos','choferes','chofer_vehiculos','asignaciones',
    'lista_negra','excepciones','antecedentes','cupos','cupo_movimientos',
    'folios_series','folios','contratos','vales_combustible','anticipos',
    'pagos_finales','movimientos_caja','arqueos',
    'dispositivos_gps','actividad_diaria','importaciones','apariciones_origen'
  ] loop
    execute format(
      'create trigger tg_audit_%1$s after insert or update or delete on %1$I
         for each row execute function fn_audit()', t);
  end loop;
end $$;

create trigger tg_contratos_upd before update on contratos         for each row execute function fn_set_updated_at();
create trigger tg_vales_upd     before update on vales_combustible for each row execute function fn_set_updated_at();
create trigger tg_anticipos_upd before update on anticipos         for each row execute function fn_set_updated_at();
create trigger tg_pagos_upd     before update on pagos_finales     for each row execute function fn_set_updated_at();
create trigger tg_disp_upd      before update on dispositivos_gps  for each row execute function fn_set_updated_at();
