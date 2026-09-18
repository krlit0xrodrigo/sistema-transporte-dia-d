-- =====================================================================
-- Permiso de Alta de Choferes para el Rol Consulta
-- Concede el permiso choferes.crear al rol 'consulta' para que sus usuarios
-- puedan dar de alta choferes con alcance global (admin).
-- =====================================================================

SET search_path = public;

INSERT INTO rol_permisos(rol_id, permiso_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permisos p ON p.codigo = 'choferes.crear'
 WHERE r.codigo = 'consulta'
ON CONFLICT DO NOTHING;
