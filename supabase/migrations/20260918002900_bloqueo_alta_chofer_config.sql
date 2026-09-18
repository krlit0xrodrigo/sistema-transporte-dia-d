-- =====================================================================
-- Bloqueo Selectivo de Alta de Choferes
-- Modifica la función auth_tiene_permiso para que verifique si el 
-- usuario está en la lista de bloqueados de la configuración global
-- =====================================================================

SET search_path = public;

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
       -- Excepción: Si el permiso es choferes.crear, verificar que no esté bloqueado
       and not (
           p_codigo = 'choferes.crear' and 
           coalesce(
             (select configuracion->'bloqueados_alta' 
              from organizaciones 
              where id = auth_organizacion_id()), 
             '[]'::jsonb
           ) ? auth.uid()::text
       )
  )
$$;
