-- =====================================================================
-- Permitir que el rol consulta vea todos los choferes globalmente
-- Modifica auth_ve_chofer para incluir al rol consulta sin depender de scopes.
-- =====================================================================

create or replace function auth_ve_chofer(p_chofer_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth_es_admin() 
      or auth_scope_global() 
      or auth_tiene_permiso('caja.ver')
      or exists (
          select 1 from usuario_roles ur
          join roles r on r.id = ur.rol_id
          where ur.usuario_id = auth.uid() and r.codigo = 'consulta'
      )
      or exists (
    select 1 from asignaciones a
     where a.chofer_id = p_chofer_id
       and a.vigente_hasta is null
       and ( a.candidato_id  in (select auth_candidatos_visibles())
          or a.barrio_id     in (select auth_barrios_visibles())
          or a.supervisor_id in (select auth_supervisores_visibles()) )
  )
$$;
