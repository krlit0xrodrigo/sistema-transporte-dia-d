-- =====================================================================
-- Ajuste de permisos para el rol "consulta"
-- =====================================================================

SET search_path = public;

-- Sacar cupos.ver ("Estructura y Cupos") de consulta
delete from rol_permisos 
where rol_id = (select id from roles where codigo = 'consulta')
  and permiso_id = (select id from permisos where codigo = 'cupos.ver');

-- Agregar excepciones.ver, lista_negra.ver y gps.gestionar_dispositivos
insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id
  from roles r
  cross join permisos p
 where r.codigo = 'consulta'
   and p.codigo in ('excepciones.ver', 'lista_negra.ver', 'gps.gestionar_dispositivos')
on conflict do nothing;
