-- =====================================================================
-- 0025 · Permiso de alta para candidatos y concejales
--
-- Los roles de candidato y concejal deben poder dar de alta choferes.
-- Al tener el permiso choferes.crear, el sistema les permite realizar el alta
-- y la función fn_alta_chofer valida automáticamente la lista negra y duplicados.
-- En caso de bloqueo por lista negra, la misma interfaz y función les permite
-- autorizar forzando el alta indicando el motivo bajo su responsabilidad.
-- =====================================================================

do $$
declare
  v_permiso uuid;
begin
  select id into v_permiso from permisos where codigo = 'choferes.crear';
  
  if v_permiso is not null then
    insert into rol_permisos (rol_id, permiso_id)
    select id, v_permiso
      from roles
     where codigo in ('candidato', 'concejal', 'candidato/concejal')
        or codigo ilike '%candidato%'
        or codigo ilike '%concejal%'
    on conflict do nothing;
  end if;
end $$;
