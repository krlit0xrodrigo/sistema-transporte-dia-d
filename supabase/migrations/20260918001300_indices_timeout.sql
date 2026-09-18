-- =====================================================================
-- 0019 · Índices para optimizar vista de antecedentes
--
-- Agrega índices necesarios para evitar timeout (error 57014) en las
-- consultas LATERAL de v_antecedentes.
-- =====================================================================

create index if not exists ix_choferes_persona_eleccion on choferes(persona_id, eleccion_id);
