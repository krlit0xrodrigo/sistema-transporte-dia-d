-- -----------------------------------------------------------------------------
-- Vistas de Fase 4 (Antecedentes, Lista Negra y Excepciones)
-- -----------------------------------------------------------------------------

create or replace view v_excepciones
with (security_invoker = true) as
select e.id, e.organizacion_id, e.eleccion_id, e.tipo, e.motivo,
       e.estado, e.vence_en, e.created_at, e.aprobado_en, e.evidencia_url,
       p.ci, p.nombre_completo,
       u_sol.nombre as solicitado_por_nombre,
       u_apr.nombre as aprobado_por_nombre
  from excepciones e
  left join personas p on p.id = e.persona_id
  left join usuarios u_sol on u_sol.id = e.solicitado_por
  left join usuarios u_apr on u_apr.id = e.aprobado_por;

create or replace view v_antecedentes
with (security_invoker = true) as
select a.id, a.organizacion_id, a.eleccion_id, a.persona_id,
       p.ci, p.nombre_completo,
       el.nombre as eleccion_nombre, el.fecha as eleccion_fecha,
       a.rol, a.resultado, a.km_recorridos, a.tuvo_gps,
       a.anticipo_pagado, a.pago_finalizado, a.incidentes,
       a.confiabilidad_dato, a.fuente, a.created_at
  from antecedentes a
  join personas p on p.id = a.persona_id
  join elecciones el on el.id = a.eleccion_id;
