-- =====================================================================
-- 0023 · Permitir a tesorería autorizar pagos finales
--
-- El rol 'tesoreria' no tenía el permiso 'caja.autorizar_pago',
-- por lo que al intentar hacer todo el flujo de caja, el sistema
-- les bloqueaba en el paso de autorización con "SIN_PERMISO".
-- =====================================================================

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id
  from roles r
  join permisos p on p.codigo = 'caja.autorizar_pago'
 where r.codigo = 'tesoreria'
on conflict do nothing;
