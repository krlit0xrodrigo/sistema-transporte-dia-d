-- =====================================================================
-- 0027 · Revocar cupos.ver del rol candidato/concejal
--
-- El candidato no debe ver la pantalla de Estructura y Cupos.
-- =====================================================================

do $$
declare
  v_permiso uuid;
begin
  select id into v_permiso from permisos where codigo = 'cupos.ver';
  
  if v_permiso is not null then
    delete from rol_permisos 
    where permiso_id = v_permiso 
      and rol_id in (
        select id from roles 
        where codigo in ('candidato', 'concejal', 'candidato/concejal') 
           or codigo ilike '%candidato%' 
           or codigo ilike '%concejal%'
      );
  end if;
end $$;
