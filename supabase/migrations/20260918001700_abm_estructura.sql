-- =====================================================================
-- 0017 – Funciones ABM para Estructura (Candidatos, Supervisores, Barrios)
-- =====================================================================

-- 1. Crear o actualizar un Candidato y su cupo
create or replace function fn_guardar_candidato(
  p_eleccion_id uuid,
  p_nombre text,
  p_cupo int,
  p_candidato_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select organizacion_id into v_org from elecciones where id = p_eleccion_id;
  if not found then raise exception 'Elección no válida'; end if;

  if p_candidato_id is null then
    -- Buscar si ya existe por nombre
    select id into v_id from candidatos 
    where organizacion_id = v_org and eleccion_id = p_eleccion_id and nombre_publico = p_nombre;

    if v_id is null then
      -- Nuevo
      insert into candidatos (organizacion_id, eleccion_id, nombre_publico, tipo, activo)
      values (v_org, p_eleccion_id, p_nombre, 'concejal', true)
      returning id into v_id;

      -- Cupo inicial
      insert into cupos (organizacion_id, eleccion_id, ambito, candidato_id, limite)
      values (v_org, p_eleccion_id, 'candidato', v_id, p_cupo);
    else
      -- Ya existe (quizás inactivo), reactivar y actualizar cupo
      update candidatos set activo = true, updated_at = now() where id = v_id;
      
      update cupos set limite = p_cupo, updated_at = now()
      where ambito = 'candidato' and candidato_id = v_id;
      
      if not found then
        insert into cupos (organizacion_id, eleccion_id, ambito, candidato_id, limite)
        values (v_org, p_eleccion_id, 'candidato', v_id, p_cupo);
      end if;
    end if;
  else
    -- Actualizar
    v_id := p_candidato_id;
    update candidatos set nombre_publico = p_nombre, updated_at = now()
    where id = v_id;

    -- Actualizar cupo
    update cupos set limite = p_cupo, updated_at = now()
    where ambito = 'candidato' and candidato_id = v_id;
    
    if not found then
      insert into cupos (organizacion_id, eleccion_id, ambito, candidato_id, limite)
      values (v_org, p_eleccion_id, 'candidato', v_id, p_cupo);
    end if;
  end if;

  return v_id;
end;
$$;


-- 2. Crear o actualizar un Supervisor y su cupo, propagando al Candidato
create or replace function fn_guardar_supervisor(
  p_eleccion_id uuid,
  p_candidato_id uuid,
  p_alias text,
  p_cupo int,
  p_supervisor_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_id uuid;
  v_cupo_anterior int := 0;
  v_delta int := 0;
begin
  select organizacion_id into v_org from elecciones where id = p_eleccion_id;
  if not found then raise exception 'Elección no válida'; end if;

  if p_supervisor_id is null then
    -- Buscar si ya existe por alias
    select id into v_id from supervisores 
    where organizacion_id = v_org and eleccion_id = p_eleccion_id and alias = p_alias;

    if v_id is null then
      -- Nuevo
      insert into supervisores (organizacion_id, eleccion_id, candidato_id, alias, activo)
      values (v_org, p_eleccion_id, p_candidato_id, p_alias, true)
      returning id into v_id;

      insert into cupos (organizacion_id, eleccion_id, ambito, supervisor_id, limite)
      values (v_org, p_eleccion_id, 'supervisor', v_id, p_cupo);

      v_delta := p_cupo;
    else
      -- Ya existe, lo reactivamos
      update supervisores set activo = true, candidato_id = p_candidato_id, updated_at = now()
      where id = v_id;

      select limite into v_cupo_anterior from cupos where ambito = 'supervisor' and supervisor_id = v_id;
      if found then
        update cupos set limite = p_cupo, updated_at = now()
        where ambito = 'supervisor' and supervisor_id = v_id;
        v_delta := p_cupo - v_cupo_anterior;
      else
        insert into cupos (organizacion_id, eleccion_id, ambito, supervisor_id, limite)
        values (v_org, p_eleccion_id, 'supervisor', v_id, p_cupo);
        v_delta := p_cupo;
      end if;
    end if;
  else
    -- Actualizar
    v_id := p_supervisor_id;
    update supervisores set alias = p_alias, candidato_id = p_candidato_id, updated_at = now()
    where id = v_id;

    -- Obtener cupo anterior
    select limite into v_cupo_anterior from cupos where ambito = 'supervisor' and supervisor_id = v_id;
    
    if found then
      update cupos set limite = p_cupo, updated_at = now()
      where ambito = 'supervisor' and supervisor_id = v_id;
      v_delta := p_cupo - v_cupo_anterior;
    else
      insert into cupos (organizacion_id, eleccion_id, ambito, supervisor_id, limite)
      values (v_org, p_eleccion_id, 'supervisor', v_id, p_cupo);
      v_delta := p_cupo;
    end if;
  end if;

  -- Propagar delta al Candidato asociado
  if v_delta != 0 then
    update cupos set limite = limite + v_delta, updated_at = now()
    where ambito = 'candidato' and candidato_id = p_candidato_id;
  end if;

  return v_id;
end;
$$;


-- 3. Crear o actualizar un Barrio y su cupo
create or replace function fn_guardar_barrio(
  p_eleccion_id uuid,
  p_nombre text,
  p_cupo int,
  p_barrio_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select organizacion_id into v_org from elecciones where id = p_eleccion_id;
  if not found then raise exception 'Elección no válida'; end if;

  if p_barrio_id is null then
    -- Buscar si ya existe por nombre
    select id into v_id from barrios 
    where organizacion_id = v_org and nombre = p_nombre;

    if v_id is null then
      -- Nuevo
      insert into barrios (organizacion_id, nombre, activo)
      values (v_org, p_nombre, true)
      returning id into v_id;

      insert into cupos (organizacion_id, eleccion_id, ambito, barrio_id, limite)
      values (v_org, p_eleccion_id, 'barrio', v_id, p_cupo);
    else
      -- Ya existe, reactivar
      update barrios set activo = true, updated_at = now() where id = v_id;
      
      update cupos set limite = p_cupo, updated_at = now()
      where ambito = 'barrio' and barrio_id = v_id and eleccion_id = p_eleccion_id;
      
      if not found then
        insert into cupos (organizacion_id, eleccion_id, ambito, barrio_id, limite)
        values (v_org, p_eleccion_id, 'barrio', v_id, p_cupo);
      end if;
    end if;
  else
    -- Actualizar
    v_id := p_barrio_id;
    update barrios set nombre = p_nombre, updated_at = now()
    where id = v_id;

    update cupos set limite = p_cupo, updated_at = now()
    where ambito = 'barrio' and barrio_id = v_id and eleccion_id = p_eleccion_id;
    
    if not found then
      insert into cupos (organizacion_id, eleccion_id, ambito, barrio_id, limite)
      values (v_org, p_eleccion_id, 'barrio', v_id, p_cupo);
    end if;
  end if;

  return v_id;
end;
$$;
