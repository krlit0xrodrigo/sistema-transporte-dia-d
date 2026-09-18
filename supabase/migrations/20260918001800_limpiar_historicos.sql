-- =====================================================================
-- 0018 – Limpieza de Históricos
-- Desactiva todos los candidatos, supervisores y barrios actuales
-- para iniciar una elección limpia desde cero con los nuevos ABMs.
-- =====================================================================

-- Desactivar todos los candidatos
update candidatos set activo = false where activo = true;

-- Desactivar todos los supervisores
update supervisores set activo = false where activo = true;

-- Desactivar todos los barrios
update barrios set activo = false where activo = true;

-- (Opcional) Poner en cero o borrar los cupos existentes si se desea empezar desde cero
-- delete from cupos; 
