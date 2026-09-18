-- =====================================================================
-- 0012 · Excepciones: Permitir auto-aprobación
--
-- Se elimina la restricción de separación de funciones (aprobado_por <> solicitado_por)
-- para permitir que un administrador apruebe las excepciones que él mismo solicitó,
-- lo cual es necesario en entornos con pocos operadores o en desarrollo.
-- =====================================================================

drop policy if exists exc_update on excepciones;

create policy exc_update on excepciones for update
  using (organizacion_id = auth_organizacion_id() and auth_tiene_permiso('excepciones.aprobar'))
  with check (organizacion_id = auth_organizacion_id());
