-- =====================================================================
-- 0022 · Ajuste de visibilidad y permisos para Tesorería
--
-- 1. Se ajusta auth_ve_chofer para que quienes tienen caja.ver 
--    (Tesorería) puedan ver a todos los choferes y operar la caja
--    sin necesitar un scope global configurado.
-- 2. Se remueven permisos de navegación de Tesorería para que 
--    sólo vean (Dashboard, Consulta, Alta, Planillas y Caja).
-- 3. Se añade el permiso choferes.crear para que puedan hacer Alta.
-- =====================================================================

create or replace function auth_ve_chofer(p_chofer_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth_es_admin() 
      or auth_scope_global() 
      or auth_tiene_permiso('caja.ver')
      or exists (
    select 1 from asignaciones a
     where a.chofer_id = p_chofer_id
       and a.vigente_hasta is null
       and ( a.candidato_id  in (select auth_candidatos_visibles())
          or a.barrio_id     in (select auth_barrios_visibles())
          or a.supervisor_id in (select auth_supervisores_visibles()) )
  )
$$;

-- Limpiar permisos de interfaz que Tesorería ya no debe tener:
-- choferes.ver (Listado choferes), asignaciones.ver (Asignaciones),
-- cupos.ver (Estructura), folios.ver (Órdenes), 
-- datos.exportar, reportes.ver, reportes.ver_montos, caja.cargar_monto
delete from rol_permisos 
 where rol_id = (select id from roles where codigo = 'tesoreria')
   and permiso_id in (
     select id from permisos where codigo in (
       'choferes.ver', 'asignaciones.ver', 'cupos.ver',
       'folios.ver', 'datos.exportar', 'reportes.ver',
       'reportes.ver_montos', 'caja.cargar_monto'
     )
   );

-- Añadir permiso para Alta de Choferes
insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id
  from roles r
  join permisos p on p.codigo = 'choferes.crear'
 where r.codigo = 'tesoreria'
on conflict do nothing;
