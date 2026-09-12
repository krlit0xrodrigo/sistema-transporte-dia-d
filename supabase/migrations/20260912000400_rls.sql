-- =====================================================================
-- 0004 · Funciones de autorización y políticas RLS
--
-- Regla de oro: TODA política empieza por organizacion_id = auth_organizacion_id().
-- Una tabla con RLS activo y sin política es una tabla cerrada, que es
-- el default correcto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones auxiliares  (stable + security definer + search_path fijo)
-- ---------------------------------------------------------------------
create or replace function auth_organizacion_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select organizacion_id from usuarios
   where id = auth.uid() and activo and deleted_at is null
$$;

create or replace function auth_tiene_permiso(p_codigo text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from usuario_roles ur
      join rol_permisos rp on rp.rol_id = ur.rol_id
      join permisos p      on p.id = rp.permiso_id
     where ur.usuario_id = auth.uid()
       and ur.organizacion_id = auth_organizacion_id()
       and p.codigo = p_codigo
  )
$$;

create or replace function auth_es_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from usuario_roles ur join roles r on r.id = ur.rol_id
     where ur.usuario_id = auth.uid()
       and ur.organizacion_id = auth_organizacion_id()
       and r.codigo in ('super_admin','admin')
  )
$$;

create or replace function auth_eleccion_actual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from elecciones
   where organizacion_id = auth_organizacion_id()
     and estado = 'activa' and deleted_at is null
   order by fecha desc limit 1
$$;

create or replace function auth_scope_global() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from usuario_scopes s
     where s.usuario_id = auth.uid()
       and s.organizacion_id = auth_organizacion_id()
       and s.tipo = 'global'
       and s.vigente_desde <= now()
       and (s.vigente_hasta is null or s.vigente_hasta > now())
  )
$$;

create or replace function auth_candidatos_visibles() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.candidato_id from usuario_scopes s
   where s.usuario_id = auth.uid()
     and s.organizacion_id = auth_organizacion_id()
     and s.tipo = 'candidato' and s.candidato_id is not null
     and s.vigente_desde <= now()
     and (s.vigente_hasta is null or s.vigente_hasta > now())
$$;

create or replace function auth_barrios_visibles() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.barrio_id from usuario_scopes s
   where s.usuario_id = auth.uid()
     and s.organizacion_id = auth_organizacion_id()
     and s.tipo = 'barrio' and s.barrio_id is not null
     and s.vigente_desde <= now()
     and (s.vigente_hasta is null or s.vigente_hasta > now())
$$;

create or replace function auth_supervisores_visibles() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.supervisor_id from usuario_scopes s
   where s.usuario_id = auth.uid()
     and s.organizacion_id = auth_organizacion_id()
     and s.tipo = 'supervisor' and s.supervisor_id is not null
     and s.vigente_desde <= now()
     and (s.vigente_hasta is null or s.vigente_hasta > now())
$$;

-- ¿El usuario ve a este chofer? Admin y scope global ven todo lo de su
-- organización; el resto, sólo lo que su asignación vigente permite.
create or replace function auth_ve_chofer(p_chofer_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth_es_admin() or auth_scope_global() or exists (
    select 1 from asignaciones a
     where a.chofer_id = p_chofer_id
       and a.vigente_hasta is null
       and ( a.candidato_id  in (select auth_candidatos_visibles())
          or a.barrio_id     in (select auth_barrios_visibles())
          or a.supervisor_id in (select auth_supervisores_visibles()) )
  )
$$;

-- ---------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizaciones','usuarios','roles','permisos','rol_permisos','usuario_roles','usuario_scopes',
    'elecciones','barrios','locales_votacion','mesas','candidatos','supervisores','alias_catalogo',
    'padron_snapshots','padron_electoral','padron_participacion',
    'personas','vehiculos','choferes','chofer_vehiculos','asignaciones',
    'lista_negra','excepciones','antecedentes','cupos','cupo_movimientos',
    'folios_series','folios','contratos','vales_combustible','anticipos','pagos_finales',
    'movimientos_caja','arqueos','dispositivos_gps','traccar_eventos','actividad_diaria',
    'origenes_planilla','importaciones','importacion_filas','apariciones_origen','exportaciones',
    'audit_log','accesos_sensibles'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Catálogos: lectura para la organización, escritura sólo admin
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['elecciones','barrios','candidatos','supervisores',
                           'alias_catalogo','origenes_planilla'] loop
    execute format($f$
      create policy %1$s_select on %1$I for select
        using (organizacion_id = auth_organizacion_id());
      create policy %1$s_write on %1$I for all
        using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.catalogos'))
        with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.catalogos'));
      create policy %1$s_nodelete on %1$I for delete using (false);
    $f$, t);
  end loop;
end $$;

-- Catálogos globales sin organización
create policy locales_select on locales_votacion for select using (auth.uid() is not null);
create policy mesas_select   on mesas            for select using (auth.uid() is not null);
create policy roles_select   on roles            for select using (auth.uid() is not null);
create policy permisos_select on permisos        for select using (auth.uid() is not null);
create policy rolperm_select on rol_permisos     for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------
-- Organización y usuarios
-- ---------------------------------------------------------------------
create policy org_select on organizaciones for select
  using (id = auth_organizacion_id());
create policy org_update on organizaciones for update
  using (id = auth_organizacion_id() and auth_tiene_permiso('admin.elecciones'));

create policy usuarios_select on usuarios for select
  using (organizacion_id = auth_organizacion_id());
create policy usuarios_write on usuarios for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.usuarios'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.usuarios'));

create policy scopes_select on usuario_scopes for select
  using (organizacion_id = auth_organizacion_id() and (usuario_id = auth.uid() or auth_es_admin()));
create policy scopes_write on usuario_scopes for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.roles'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.roles'));

create policy uroles_select on usuario_roles for select
  using (organizacion_id = auth_organizacion_id() and (usuario_id = auth.uid() or auth_es_admin()));
create policy uroles_write on usuario_roles for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.roles'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('admin.roles'));

-- ---------------------------------------------------------------------
-- Padrón: transversal, sólo lectura con permiso. Escritura sólo importador.
-- ---------------------------------------------------------------------
create policy padron_snap_select on padron_snapshots   for select using (auth_tiene_permiso('padron.consultar'));
create policy padron_select      on padron_electoral   for select using (auth_tiene_permiso('padron.consultar'));
create policy padron_part_select on padron_participacion for select using (auth_tiene_permiso('padron.consultar'));
create policy padron_snap_write  on padron_snapshots   for insert with check (auth_tiene_permiso('padron.importar'));
create policy padron_write       on padron_electoral   for insert with check (auth_tiene_permiso('padron.importar'));
create policy padron_part_write  on padron_participacion for insert with check (auth_tiene_permiso('padron.importar'));

-- ---------------------------------------------------------------------
-- Personas y choferes
-- ---------------------------------------------------------------------
create policy personas_select on personas for select
  using (organizacion_id = auth_organizacion_id()
         and deleted_at is null
         and (auth_es_admin() or auth_scope_global()
              or exists (select 1 from choferes c
                          where c.persona_id = personas.id and auth_ve_chofer(c.id))));
create policy personas_insert on personas for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('personas.crear'));
create policy personas_update on personas for update
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('personas.editar'))
  with check (organizacion_id = auth_organizacion_id());
create policy personas_nodelete on personas for delete using (false);

create policy choferes_select on choferes for select
  using (organizacion_id = auth_organizacion_id() and deleted_at is null and auth_ve_chofer(id));
create policy choferes_insert on choferes for insert
  with check (organizacion_id = auth_organizacion_id()
              and auth_tiene_permiso('choferes.crear')
              and eleccion_id = auth_eleccion_actual());
create policy choferes_update on choferes for update
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('choferes.editar') and auth_ve_chofer(id))
  with check (organizacion_id = auth_organizacion_id());
create policy choferes_nodelete on choferes for delete using (false);

create policy asign_select on asignaciones for select using (auth_ve_chofer(chofer_id));
create policy asign_write  on asignaciones for insert
  with check (auth_tiene_permiso('asignaciones.asignar') and eleccion_id = auth_eleccion_actual());
create policy asign_update on asignaciones for update
  using (auth_tiene_permiso('asignaciones.reasignar') and auth_ve_chofer(chofer_id));
create policy asign_nodelete on asignaciones for delete using (false);

create policy vehiculos_select on vehiculos for select using (organizacion_id = auth_organizacion_id());
create policy vehiculos_write  on vehiculos for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('choferes.editar'))
  with check (organizacion_id = auth_organizacion_id());
create policy vehiculos_nodelete on vehiculos for delete using (false);

create policy chveh_select on chofer_vehiculos for select using (auth_ve_chofer(chofer_id));
create policy chveh_write  on chofer_vehiculos for all
  using (auth_tiene_permiso('choferes.editar') and auth_ve_chofer(chofer_id))
  with check (auth_tiene_permiso('choferes.editar'));

create policy apar_select on apariciones_origen for select
  using (organizacion_id = auth_organizacion_id()
         and exists (select 1 from choferes c where c.persona_id = apariciones_origen.persona_id and auth_ve_chofer(c.id)));
create policy apar_insert on apariciones_origen for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('datos.importar'));
create policy apar_nodelete on apariciones_origen for delete using (false);

-- ---------------------------------------------------------------------
-- Control: lista negra invisible a supervisor y candidato
-- ---------------------------------------------------------------------
create policy ln_select on lista_negra for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('lista_negra.ver'));
create policy ln_write on lista_negra for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('lista_negra.gestionar'));
create policy ln_update on lista_negra for update
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('lista_negra.revocar'))
  with check (organizacion_id = auth_organizacion_id());
create policy ln_nodelete on lista_negra for delete using (false);

create policy exc_select on excepciones for select
  using (organizacion_id = auth_organizacion_id()
         and (solicitado_por = auth.uid() or auth_tiene_permiso('excepciones.ver') or auth_tiene_permiso('excepciones.aprobar')));
create policy exc_insert on excepciones for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('excepciones.solicitar')
              and solicitado_por = auth.uid());
create policy exc_update on excepciones for update
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('excepciones.aprobar'))
  with check (organizacion_id = auth_organizacion_id() and aprobado_por <> solicitado_por);
create policy exc_nodelete on excepciones for delete using (false);

create policy ant_select on antecedentes for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('choferes.ver'));
create policy ant_write on antecedentes for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('datos.importar'));

-- ---------------------------------------------------------------------
-- Cupos
-- ---------------------------------------------------------------------
create policy cupos_select on cupos for select using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('cupos.ver'));
create policy cupos_write  on cupos for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('cupos.definir'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('cupos.definir'));
create policy cupos_nodelete on cupos for delete using (false);

create policy cupomov_select on cupo_movimientos for select
  using (exists (select 1 from cupos c where c.id = cupo_id and c.organizacion_id = auth_organizacion_id())
         and auth_tiene_permiso('cupos.ver'));
-- La escritura sólo ocurre dentro de las RPC (security definer).
create policy cupomov_nowrite on cupo_movimientos for insert with check (false);
create policy cupomov_nodelete on cupo_movimientos for delete using (false);

-- ---------------------------------------------------------------------
-- Caja: lectura con caja.ver o el propio scope; escritura por permiso
-- ---------------------------------------------------------------------
do $$
declare t text; p text;
begin
  foreach t in array array['contratos','vales_combustible','anticipos','pagos_finales'] loop
    p := case t
           when 'contratos'         then 'contratos.generar'
           when 'vales_combustible' then 'caja.entregar_vale'
           when 'anticipos'         then 'caja.marcar_anticipo'
           else 'caja.marcar_pago_final' end;
    execute format($f$
      create policy %1$s_select on %1$I for select
        using (organizacion_id = auth_organizacion_id()
               and (auth_tiene_permiso('caja.ver') or auth_ve_chofer(chofer_id)));
      create policy %1$s_insert on %1$I for insert
        with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso(%2$L));
      create policy %1$s_update on %1$I for update
        using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso(%2$L))
        with check (organizacion_id = auth_organizacion_id());
      create policy %1$s_nodelete on %1$I for delete using (false);
    $f$, t, p);
  end loop;
end $$;

create policy folios_serie_select on folios_series for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('folios.ver'));
create policy folios_serie_write on folios_series for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('folios.emitir_serie'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('folios.emitir_serie'));

create policy folios_select on folios for select
  using (exists (select 1 from folios_series s where s.id = serie_id and s.organizacion_id = auth_organizacion_id())
         and auth_tiene_permiso('folios.ver'));
-- La asignación de folios pasa sólo por fn_asignar_folio.
create policy folios_nowrite  on folios for insert with check (auth_tiene_permiso('folios.emitir_serie'));
create policy folios_update   on folios for update using (auth_tiene_permiso('folios.anular'));
create policy folios_nodelete on folios for delete using (false);

create policy mov_select on movimientos_caja for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('caja.ver'));
create policy mov_insert on movimientos_caja for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('caja.cargar_monto'));
-- Append-only: una corrección es un contramovimiento.
create policy mov_noupdate on movimientos_caja for update using (false);
create policy mov_nodelete on movimientos_caja for delete using (false);

create policy arqueos_select on arqueos for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('caja.arqueo'));
create policy arqueos_write on arqueos for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('caja.arqueo'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('caja.arqueo'));

-- ---------------------------------------------------------------------
-- GPS
-- ---------------------------------------------------------------------
create policy disp_select on dispositivos_gps for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('gps.ver'));
create policy disp_write on dispositivos_gps for all
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('gps.gestionar_dispositivos'))
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('gps.gestionar_dispositivos'));

create policy eventos_select on traccar_eventos for select using (auth_es_admin() or auth_tiene_permiso('auditoria.ver'));
create policy eventos_nowrite on traccar_eventos for insert with check (false);   -- sólo el job (service_role)

create policy act_select on actividad_diaria for select using (auth_ve_chofer(chofer_id) and auth_tiene_permiso('gps.ver'));
create policy act_write  on actividad_diaria for all
  using (auth_tiene_permiso('gps.recalcular')) with check (auth_tiene_permiso('gps.recalcular'));

-- ---------------------------------------------------------------------
-- Importación y exportación
-- ---------------------------------------------------------------------
create policy imp_select on importaciones for select
  using (organizacion_id = auth_organizacion_id() and (auth_tiene_permiso('datos.importar') or auth_es_admin()));
create policy imp_insert on importaciones for insert
  with check (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('datos.importar'));
create policy imp_update on importaciones for update
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('datos.importar'));
create policy imp_nodelete on importaciones for delete using (false);

create policy filas_select on importacion_filas for select
  using (exists (select 1 from importaciones i where i.id = importacion_id and i.organizacion_id = auth_organizacion_id())
         and auth_tiene_permiso('datos.importar'));
create policy filas_write on importacion_filas for all
  using (auth_tiene_permiso('datos.importar')) with check (auth_tiene_permiso('datos.importar'));

create policy exp_select on exportaciones for select
  using (organizacion_id = auth_organizacion_id() and (usuario_id = auth.uid() or auth_tiene_permiso('auditoria.ver')));
create policy exp_insert on exportaciones for insert
  with check (organizacion_id = auth_organizacion_id() and usuario_id = auth.uid() and auth_tiene_permiso('datos.exportar'));
create policy exp_nodelete on exportaciones for delete using (false);

-- ---------------------------------------------------------------------
-- Auditoría: lectura con permiso, escritura sólo por trigger. Nadie borra.
-- ---------------------------------------------------------------------
create policy audit_select on audit_log for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('auditoria.ver'));
create policy audit_noinsert on audit_log for insert with check (false);
create policy audit_noupdate on audit_log for update using (false);
create policy audit_nodelete on audit_log for delete using (false);

create policy acc_select on accesos_sensibles for select
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('auditoria.ver'));
create policy acc_insert on accesos_sensibles for insert
  with check (organizacion_id = auth_organizacion_id() and usuario_id = auth.uid());
create policy acc_noupdate on accesos_sensibles for update using (false);
create policy acc_nodelete on accesos_sensibles for delete using (false);

-- ---------------------------------------------------------------------
-- Grants: el rol anónimo no toca nada; `authenticated` recibe el permiso
-- de SQL y RLS decide qué filas ve. Nadie borra físicamente.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- El DELETE no se concede a nadie: el borrado es lógico (deleted_at).
revoke delete on all tables in schema public from authenticated;

alter default privileges in schema public
  grant select, insert, update on tables to authenticated;
