-- =====================================================================
-- 0020 · Flexibilizar autorización de pago y pago final
--
-- 1. Se elimina la validación estricta que exigía actividad GPS o una 
-- excepción aprobada para poder autorizar el pago final.
-- 2. Se elimina la restricción de que quien autoriza no puede pagar.
-- =====================================================================

create or replace function fn_autorizar_pago_final(
  p_chofer_id uuid, p_excepcion_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid := auth_organizacion_id();
  v_elec uuid; v_pago uuid; v_actividad boolean;
begin
  if not auth_tiene_permiso('caja.autorizar_pago') then
    raise exception 'SIN_PERMISO: autorizar el pago final requiere rol administrador'
      using errcode = 'insufficient_privilege';
  end if;

  select eleccion_id into v_elec from choferes
   where id = p_chofer_id and organizacion_id = v_org and deleted_at is null;
  if v_elec is null then
    raise exception 'CHOFER_INEXISTENTE' using errcode = 'no_data_found';
  end if;

  select exists (select 1 from actividad_diaria
                  where chofer_id = p_chofer_id and clasificacion = 'activo')
    into v_actividad;

  if p_excepcion_id is not null
     and not exists (select 1 from excepciones
                      where id = p_excepcion_id and estado = 'aprobada'
                        and (vence_en is null or vence_en > now())) then
    raise exception 'EXCEPCION_INVALIDA: la excepción no está aprobada o venció'
      using errcode = 'check_violation';
  end if;

  select id into v_pago from pagos_finales
   where chofer_id = p_chofer_id and estado <> 'anulado';

  if v_pago is null then
    insert into pagos_finales(organizacion_id, chofer_id, eleccion_id,
                              basado_en_actividad, excepcion_id, estado)
    values (v_org, p_chofer_id, v_elec, v_actividad, p_excepcion_id, 'pendiente')
    returning id into v_pago;
  end if;

  update pagos_finales
     set autorizado_por = auth.uid(), basado_en_actividad = v_actividad,
         excepcion_id = coalesce(p_excepcion_id, excepcion_id)
   where id = v_pago;

  return v_pago;
end $$;


create or replace function fn_registrar_pago_final(p_chofer_id uuid, p_monto numeric default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pago uuid; v_autorizo uuid; v_serie uuid; v_folio uuid;
begin
  if not auth_tiene_permiso('caja.marcar_pago_final') then
    raise exception 'SIN_PERMISO' using errcode = 'insufficient_privilege';
  end if;

  select id, autorizado_por into v_pago, v_autorizo from pagos_finales
   where chofer_id = p_chofer_id and estado <> 'anulado';

  if v_pago is null or v_autorizo is null then
    raise exception 'SIN_AUTORIZACION: el pago final tiene que estar autorizado antes de marcarse'
      using errcode = 'check_violation';
  end if;

  -- Se quitó el chequeo que impedía que la misma persona autorice y pague
  -- if v_autorizo = auth.uid() then
  --   raise exception 'MISMA_PERSONA: quien autorizó el pago no puede marcarlo como pagado'
  --     using errcode = 'check_violation';
  -- end if;

  v_serie := fn_serie_disponible('pago_final');
  if v_serie is not null then
    v_folio := fn_asignar_folio(v_serie, 'pago_final', v_pago);
  end if;

  update pagos_finales
     set finalizado = true, fecha_finalizacion = now(), registrado_por = auth.uid(),
         estado = 'finalizado', monto = coalesce(p_monto, monto),
         folio_id = coalesce(v_folio, folio_id)
   where id = v_pago and not finalizado;

  return jsonb_build_object('pago_id', v_pago, 'folio_id', v_folio);
end $$;
