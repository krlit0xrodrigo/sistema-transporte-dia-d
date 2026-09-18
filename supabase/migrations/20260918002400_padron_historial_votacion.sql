-- =====================================================================
-- 0024 · Incluir historial de votación en fn_verificar_padron
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_verificar_padron(text);

CREATE OR REPLACE FUNCTION public.fn_verificar_padron(p_ci text)
 RETURNS TABLE(
    encontrado boolean, 
    ci text, 
    nombre_completo text, 
    nombres text,
    apellidos text,
    local_votacion_id uuid, 
    local_nombre text, 
    mesa integer, 
    orden integer, 
    direccion text, 
    partidos text, 
    seccional text,
    historial_votacion jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ci text := fn_normalizar_ci(p_ci);
begin
  insert into accesos_sensibles(organizacion_id, usuario_id, recurso, accion, contexto)
  values (auth_organizacion_id(), auth.uid(), 'padron', 'consulta', jsonb_build_object('ci', v_ci));

  return query
  select true, p.ci, p.nombre_completo, p.nombres, p.apellidos, p.local_votacion_id, l.nombre,
         p.mesa, p.orden, p.direccion, p.partidos, p.seccional,
         (
           select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'eleccion_codigo', pp.eleccion_codigo,
                      'voto', pp.voto
                    ) order by pp.eleccion_codigo
                  ), '[]'::jsonb)
             from padron_participacion pp
            where pp.snapshot_id = p.snapshot_id
              and pp.ci = p.ci
         ) as historial_votacion
    from padron_electoral p
    join padron_snapshots s on s.id = p.snapshot_id and s.vigente
    left join locales_votacion l on l.id = p.local_votacion_id
   where p.ci = v_ci;
   
  if not found then
    return query select false, v_ci, null::text, null::text, null::text, null::uuid, null::text,
                        null::int, null::int, null::text, null::text, null::text, null::jsonb;
  end if;
end $function$;
