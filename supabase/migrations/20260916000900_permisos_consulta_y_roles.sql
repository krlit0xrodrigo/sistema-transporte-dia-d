-- =====================================================================
-- 0009 · Tres huecos en la matriz de permisos, encontrados al construir
--        la pantalla de usuarios y el rol de solo lectura.
--
-- Inserta filas en `rol_permisos` y concede DELETE sobre dos tablas de
-- configuración. No crea roles, no crea permisos, no toca datos
-- operativos y no modifica ninguna política.
--
-- ---------------------------------------------------------------------
-- HUECO 1 — nadie podía asignar roles.
--
-- Las políticas `uroles_write` y `scopes_write` exigen `admin.roles`:
--
--     using (... and auth_tiene_permiso('admin.roles'))
--
-- El permiso existe en el catálogo (seed.sql) pero NO estaba en la lista
-- del rol `admin`. Resultado: ni el administrador podía darle un rol a
-- otro usuario, y la pantalla de usuarios era imposible de usar. Se
-- detectó al construirla.
--
-- ---------------------------------------------------------------------
-- HUECO 2 — el rol `consulta` no llegaba a ver una ficha.
--
-- El rol ya existía con `choferes.ver`, `asignaciones.ver`, `cupos.ver` y
-- `gps.ver`, pero sin `personas.ver` ni `choferes.ver_pii` no puede leer
-- la cédula ni el teléfono, que es justamente lo que se consulta. Se le
-- agregan esos dos y nada más.
--
-- Lo que el rol `consulta` sigue SIN poder hacer, y no por la interfaz
-- sino porque RLS lo rechaza:
--
--   · crear, editar o dar de baja choferes  (choferes.crear/editar/baja)
--   · asignar o reasignar                   (asignaciones.asignar)
--   · tocar caja, contratos o pagos         (caja.*, contratos.*)
--   · ver o gestionar la lista negra        (lista_negra.*)
--   · definir cupos                         (cupos.definir)
--   · exportar                              (datos.exportar)
--   · consultar el padrón                   (padron.consultar)
--   · administrar usuarios, roles o catálogos (admin.*)
--
-- Es solo lectura de verdad: si la pantalla se equivocara y le mostrara un
-- botón de guardar, la base rechazaría igual la escritura.
-- =====================================================================

-- Hueco 1: el administrador puede administrar roles y scopes.
insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id
  from roles r
  join permisos p on p.codigo = 'admin.roles'
 where r.codigo in ('super_admin', 'admin')
on conflict do nothing;

-- Hueco 2: el rol consulta puede leer la identidad de la persona.
insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id
  from roles r
  join permisos p on p.codigo = any(array['personas.ver', 'choferes.ver_pii'])
 where r.codigo = 'consulta'
on conflict do nothing;

-- Verificación.
do $$
declare n int;
begin
  -- Sobre una base nueva las migraciones corren antes del seed: todavía no
  -- hay roles que verificar. El seed ya trae estos permisos incorporados,
  -- así que no hay nada que arreglar en ese caso.
  if not exists (select 1 from roles) then
    raise notice '  (catálogo de roles vacío: lo trae el seed)';
    return;
  end if;

  select count(*) into n
    from roles r
    join rol_permisos rp on rp.rol_id = r.id
    join permisos p on p.id = rp.permiso_id
   where r.codigo = 'admin' and p.codigo = 'admin.roles';
  if n = 0 then
    raise exception 'VERIFICACIÓN FALLIDA: el rol admin sigue sin admin.roles';
  end if;

  select count(*) into n
    from roles r
    join rol_permisos rp on rp.rol_id = r.id
    join permisos p on p.id = rp.permiso_id
   where r.codigo = 'consulta'
     and p.codigo = any(array['choferes.ver','personas.ver','choferes.ver_pii','asignaciones.ver']);
  if n < 4 then
    raise exception 'VERIFICACIÓN FALLIDA: el rol consulta no llega a leer una ficha (% de 4)', n;
  end if;

  -- Y lo que NO tiene que poder: si alguna de estas apareciera, el rol
  -- dejó de ser de solo lectura.
  select count(*) into n
    from roles r
    join rol_permisos rp on rp.rol_id = r.id
    join permisos p on p.id = rp.permiso_id
   where r.codigo = 'consulta'
     and (p.codigo like 'admin.%' or p.codigo like 'caja.%'
       or p.codigo like 'lista_negra.%' or p.codigo like 'contratos.%'
       or p.codigo in ('choferes.crear','choferes.editar','choferes.baja',
                       'personas.crear','personas.editar','asignaciones.asignar',
                       'asignaciones.reasignar','cupos.definir','datos.exportar',
                       'padron.consultar'));
  if n > 0 then
    raise exception 'VERIFICACIÓN FALLIDA: el rol consulta tiene % permiso(s) de escritura', n;
  end if;

  raise notice '  ✓ admin puede gestionar roles; consulta es solo lectura';
end $$;

-- ---------------------------------------------------------------------
-- HUECO 3 — quitar un rol era imposible.
--
-- La migración 0004 hace `revoke delete on all tables from authenticated`
-- porque en este sistema nada se borra: el borrado del dominio es lógico
-- (`deleted_at`) y la bitácora es inviolable. Correcto para choferes,
-- personas y caja.
--
-- Pero `usuario_roles` y `usuario_scopes` no son datos del operativo: son
-- configuración de acceso, y no tienen columna de borrado lógico. Sin
-- DELETE no se le puede sacar un rol a nadie — ni al empleado que se fue
-- el 5 de octubre. Se concede el DELETE sólo sobre esas dos tablas; las
-- políticas `uroles_write` y `scopes_write` siguen exigiendo `admin.roles`
-- en el `using`, así que quién puede borrar no cambia: sigue siendo el
-- administrador y nadie más.
--
-- El resto de las tablas siguen sin DELETE para nadie.
-- ---------------------------------------------------------------------
grant delete on usuario_roles  to authenticated;
grant delete on usuario_scopes to authenticated;

do $$
declare n int;
begin
  select count(*) into n from information_schema.table_privileges
   where grantee = 'authenticated' and privilege_type = 'DELETE'
     and table_schema = 'public';
  if n <> 2 then
    raise exception 'VERIFICACIÓN FALLIDA: DELETE concedido sobre % tablas, se esperaban exactamente 2', n;
  end if;
  raise notice '  ✓ DELETE sólo sobre usuario_roles y usuario_scopes';
end $$;
