-- =====================================================================
-- 0020 Â· Resetear Nro de Orden y Permitir a Candidatos dar de Baja
-- =====================================================================

DO $$ 
DECLARE
  v_rol_id uuid;
  v_perm_id uuid;
BEGIN
  -- 1. Resetear numero_orden a 0 para iniciar producciÃ³n limpios
  UPDATE choferes SET numero_orden = 0;

  -- 2. Asignar permiso 'choferes.baja' al rol 'candidato'
  SELECT id INTO v_rol_id FROM roles WHERE codigo = 'candidato';
  SELECT id INTO v_perm_id FROM permisos WHERE codigo = 'choferes.baja';

  IF v_rol_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM rol_permisos WHERE rol_id = v_rol_id AND permiso_id = v_perm_id) THEN
      INSERT INTO rol_permisos (rol_id, permiso_id) VALUES (v_rol_id, v_perm_id);
    END IF;
  END IF;
END $$;

-- 3. Modificar fn_baja_chofer para seguridad de nivel de fila basada en scope
create or replace function fn_baja_chofer(p_chofer_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not auth_tiene_permiso('choferes.baja') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  -- Seguridad adicional: si no es admin/coordinador global, debe tener visibilidad sobre este chofer
  -- (es decir, el chofer debe estar asignado a su candidato_id o bajo su scope)
  if not auth_ve_chofer(p_chofer_id) then
    raise exception 'ACCESO_DENEGADO_CHOFER' using errcode = 'insufficient_privilege';
  end if;

  update asignaciones set vigente_hasta = now(), motivo_cambio = p_motivo
   where chofer_id = p_chofer_id and vigente_hasta is null;
   
  update choferes set estado = 'baja', dado_de_baja_en = now(),
                      motivo_baja = p_motivo, updated_by = auth.uid()
   where id = p_chofer_id;
   
  perform fn_liberar_cupo(p_chofer_id, 'baja: ' || p_motivo);
end $$;
