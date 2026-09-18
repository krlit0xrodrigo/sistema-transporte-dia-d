-- =====================================================================
-- 0016 – Configuración global de montos para Caja
-- =====================================================================

alter table elecciones
  add column if not exists monto_combustible numeric(14,0) not null default 0,
  add column if not exists monto_anticipo numeric(14,0) not null default 0,
  add column if not exists monto_pago_final numeric(14,0) not null default 0;

-- Permitir a los usuarios con permisos de admin.catalogos o caja actualizar la elección activa?
-- Actualmente la tabla elecciones solo se actualiza por admin.catalogos, pero
-- tal vez la configuración de caja la haga alguien de caja.
-- Ya que el RLS de elecciones permite 'update' a auth_tiene_permiso('admin.catalogos'),
-- el administrador de la plataforma podrá setear estos valores, o se puede usar una 
-- función con security definer.

-- Creamos una función rápida para actualizar los montos de la elección activa
create or replace function fn_guardar_montos_caja(
  p_eleccion_id uuid,
  p_monto_combustible numeric,
  p_monto_anticipo numeric,
  p_monto_pago_final numeric
)
returns void
language plpgsql
security definer
as $$
begin
  -- Solo usuarios autenticados
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update elecciones
     set monto_combustible = p_monto_combustible,
         monto_anticipo = p_monto_anticipo,
         monto_pago_final = p_monto_pago_final,
         updated_at = now()
   where id = p_eleccion_id;
end;
$$;
