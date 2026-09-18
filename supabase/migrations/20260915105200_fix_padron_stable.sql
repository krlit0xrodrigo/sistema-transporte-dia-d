-- Fix: fn_verificar_padron cannot be STABLE because it inserts into accesos_sensibles.

CREATE OR REPLACE FUNCTION public.fn_verificar_padron(p_ci text)
 RETURNS TABLE(encontrado boolean, ci text, nombre_completo text, local_votacion_id uuid, local_nombre text, mesa integer, orden integer, direccion text, partidos text, seccional text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ci text := fn_normalizar_ci(p_ci);
begin
  insert into accesos_sensibles(organizacion_id, usuario_id, recurso, accion, contexto)
  values (auth_organizacion_id(), auth.uid(), 'padron', 'consulta', jsonb_build_object('ci', v_ci));

  return query
  select true, p.ci, p.nombre_completo, p.local_votacion_id, l.nombre, p.mesa, p.orden, p.direccion, p.partidos, p.seccional
    from padron_electoral p
    left join locales_votacion l on l.id = p.local_votacion_id
   where p.ci = v_ci
     and p.eleccion_id = (select id from elecciones where estado = 'activa' and organizacion_id = auth_organizacion_id() limit 1)
   limit 1;
   
  if not found then
    return query select false, v_ci, null::text, null::uuid, null::text, null::int, null::int, null::text, null::text, null::text;
  end if;
end $function$;
