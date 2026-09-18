-- =====================================================================
-- 0026 · Permisos de Dashboard, Antecedentes y Scopes
--
-- Se agregan permisos para aislar Dashboard y Antecedentes.
-- Se asignan estos permisos a roles administrativos, consulta, etc. 
-- pero NO a candidato/concejal.
-- =====================================================================

do $$
declare
  v_permiso_dash uuid;
  v_permiso_ant uuid;
  v_permiso_chof uuid;
  v_permiso_gps uuid;
  v_rol_admin uuid;
  v_rol_super uuid;
  v_rol_tesoreria uuid;
  v_rol_consulta uuid;
begin
  -- 1. Crear permisos si no existen
  insert into permisos (codigo, modulo, descripcion) 
  values ('dashboard.ver', 'operacion', 'Ver el dashboard principal'),
         ('antecedentes.ver', 'control', 'Ver el listado de antecedentes')
  on conflict (codigo) do nothing;

  select id into v_permiso_dash from permisos where codigo = 'dashboard.ver';
  select id into v_permiso_ant from permisos where codigo = 'antecedentes.ver';
  select id into v_permiso_chof from permisos where codigo = 'choferes.ver';
  select id into v_permiso_gps from permisos where codigo = 'gps.ver';

  -- 2. Asignar los nuevos permisos a roles preexistentes que sí deban verlos
  -- Roles que ven el dashboard y antecedentes: admin, super_admin, tesoreria, consulta
  insert into rol_permisos (rol_id, permiso_id)
  select id, v_permiso_dash
    from roles
   where codigo in ('admin', 'super_admin', 'tesoreria', 'consulta', 'auditor')
  on conflict do nothing;

  insert into rol_permisos (rol_id, permiso_id)
  select id, v_permiso_ant
    from roles
   where codigo in ('admin', 'super_admin', 'consulta', 'auditor')
  on conflict do nothing;

  -- 3. Asegurar que candidato/concejal tenga choferes.ver y gps.ver
  if v_permiso_chof is not null then
    insert into rol_permisos (rol_id, permiso_id)
    select id, v_permiso_chof
      from roles
     where codigo in ('candidato', 'concejal', 'candidato/concejal')
        or codigo ilike '%candidato%'
        or codigo ilike '%concejal%'
    on conflict do nothing;
  end if;

  if v_permiso_gps is not null then
    insert into rol_permisos (rol_id, permiso_id)
    select id, v_permiso_gps
      from roles
     where codigo in ('candidato', 'concejal', 'candidato/concejal')
        or codigo ilike '%candidato%'
        or codigo ilike '%concejal%'
    on conflict do nothing;
  end if;

end $$;
