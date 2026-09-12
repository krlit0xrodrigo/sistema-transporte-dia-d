-- =====================================================================
-- 0007 · Separar el histórico de la interna del 07/06/2026 de la
--        operación actual del 04/10/2026.
--
-- QUÉ PASÓ
-- --------
-- El importador de choferes resuelve la elección así:
--
--     select id from elecciones where organizacion_id=%s and estado='activa'
--
-- La única elección activa es «Día D — Municipales Villa Hayes» (04/10/2026),
-- así que las 599 participaciones que venían de las planillas de junio
-- quedaron cargadas como choferes del operativo actual. No son eso: son
-- participaciones en la interna del 07/06/2026, que existe en el catálogo
-- (estado 'cerrada') y hoy sólo tiene los 585 antecedentes.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- -----------------------
-- Mueve a la elección interna las participaciones que vinieron de una
-- planilla (`origen_planilla_id is not null`) junto con sus asignaciones,
-- apariciones de origen y dispositivos. Nada se borra: es un cambio de
-- `eleccion_id`, y el trigger `tg_audit_choferes` deja en `audit_log` el
-- valor anterior de cada fila, así que la reversión es reconstruible.
--
-- QUÉ **NO** TOCA
-- ---------------
--   · personas, vehiculos, antecedentes, padrón: intactos.
--   · candidatos, barrios, supervisores: son catálogo. Los mismos
--     concejales y los mismos 22 supervisores trabajan en las dos
--     elecciones, y el operativo actual los necesita. Quedan donde están;
--     la ficha los resuelve por id, no por elección, así que el histórico
--     los sigue mostrando bien.
--   · Los choferes dados de alta desde la aplicación (`origen_planilla_id
--     is null`): son la operación actual y no se mueven.
--
-- SEGURIDAD
-- ---------
-- Es idempotente: correrla dos veces no hace nada la segunda vez.
-- Aborta —sin escribir— si encuentra documentos de caja emitidos sobre un
-- chofer importado, porque mover la participación dejaría el contrato en
-- la elección equivocada. Si eso pasa, hay que decidir a mano.
--
-- CÓMO APLICARLA
-- --------------
--     supabase db push
--
-- o pegando el archivo en el SQL editor. Los `raise notice` informan
-- cuántas filas se movieron en cada tabla.
--
-- CÓMO REVERTIRLA
-- ---------------
-- Al final del archivo, comentado, queda el UPDATE inverso. Reconstruye
-- exactamente el estado previo porque el criterio (`origen_planilla_id is
-- not null`) es el mismo en las dos direcciones.
-- =====================================================================

do $$
declare
  v_org        uuid;
  v_interna    uuid;
  v_actual     uuid;
  v_choferes   int;
  v_asig       int;
  v_apar       int;
  v_disp       int;
  v_caja       int;
  v_restantes  int;
begin
  -- Sobre una base recién creada, las migraciones corren ANTES del seed:
  -- todavía no hay organización ni elecciones. En ese caso no hay nada que
  -- mover y la migración se salta sola. No es un error.
  select id into v_org from organizaciones where codigo = 'dia-d-vh';
  if v_org is null then
    raise notice '  (base sin datos: no hay nada que separar)';
    return;
  end if;

  select id into v_interna from elecciones
   where organizacion_id = v_org and fecha = date '2026-06-07' and deleted_at is null;
  select id into v_actual from elecciones
   where organizacion_id = v_org and estado = 'activa' and deleted_at is null
   order by fecha desc limit 1;

  if v_interna is null or v_actual is null then
    raise notice '  (faltan las elecciones del catálogo: no hay nada que separar)';
    return;
  end if;
  if v_interna = v_actual then
    raise exception 'La interna del 07/06 figura como activa. Revisá el catálogo antes de seguir';
  end if;

  -- ---------------------------------------------------------------
  -- Guarda: caja emitida sobre choferes importados.
  -- Mover la participación dejaría el documento colgado de la
  -- elección equivocada, y un contrato con folio no se reescribe a la
  -- ligera. Si aparece, se corta acá y se decide a mano.
  -- ---------------------------------------------------------------
  select count(*) into v_caja
    from choferes ch
   where ch.eleccion_id = v_actual
     and ch.origen_planilla_id is not null
     and (exists (select 1 from contratos          d where d.chofer_id = ch.id)
       or exists (select 1 from vales_combustible  d where d.chofer_id = ch.id)
       or exists (select 1 from anticipos          d where d.chofer_id = ch.id)
       or exists (select 1 from pagos_finales      d where d.chofer_id = ch.id));

  if v_caja > 0 then
    raise exception
      'ABORTADA: % chofer(es) importado(s) ya tienen documentos de caja emitidos. '
      'Mover su participación dejaría el contrato en la elección equivocada. '
      'Resolvé esos casos a mano antes de correr esta migración.', v_caja;
  end if;

  -- ---------------------------------------------------------------
  -- Guarda: consumo de cupo. Los movimientos cuelgan del cupo, que es
  -- por elección; moverlos en silencio descuadraría el tablero.
  -- ---------------------------------------------------------------
  if exists (
    select 1 from cupo_movimientos m
      join choferes ch on ch.id = m.chofer_id
     where ch.eleccion_id = v_actual and ch.origen_planilla_id is not null)
  then
    raise exception
      'ABORTADA: hay consumo de cupo registrado sobre choferes importados. '
      'Liberá esos cupos antes de mover las participaciones.';
  end if;

  -- ---------------------------------------------------------------
  -- El movimiento. Orden: primero las hijas que llevan eleccion_id
  -- propia, después la participación.
  -- ---------------------------------------------------------------
  update apariciones_origen ao
     set eleccion_id = v_interna
   where ao.eleccion_id = v_actual
     and ao.origen_planilla_id is not null;
  get diagnostics v_apar = row_count;

  update asignaciones a
     set eleccion_id = v_interna
   where a.eleccion_id = v_actual
     and exists (select 1 from choferes ch
                  where ch.id = a.chofer_id
                    and ch.eleccion_id = v_actual
                    and ch.origen_planilla_id is not null);
  get diagnostics v_asig = row_count;

  update dispositivos_gps d
     set eleccion_id = v_interna
   where d.eleccion_id = v_actual
     and exists (select 1 from choferes ch
                  where ch.id = d.chofer_id
                    and ch.eleccion_id = v_actual
                    and ch.origen_planilla_id is not null);
  get diagnostics v_disp = row_count;

  -- La participación. El trigger de auditoría guarda el eleccion_id
  -- anterior de cada fila: ahí está el rastro para revertir.
  update choferes ch
     set eleccion_id = v_interna,
         updated_at  = now()
   where ch.eleccion_id = v_actual
     and ch.origen_planilla_id is not null;
  get diagnostics v_choferes = row_count;

  select count(*) into v_restantes
    from choferes where eleccion_id = v_actual and deleted_at is null and estado <> 'baja';

  raise notice '';
  raise notice '  choferes movidos a la interna 07/06 ......... %', v_choferes;
  raise notice '  asignaciones movidas ....................... %', v_asig;
  raise notice '  apariciones de origen movidas .............. %', v_apar;
  raise notice '  dispositivos GPS movidos ................... %', v_disp;
  raise notice '';
  raise notice '  choferes en el operativo actual ............ %', v_restantes;
  raise notice '';

  if v_choferes = 0 then
    raise notice '  (nada que mover: la migración ya se había aplicado)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Verificación: ninguna participación importada quedó en la elección
-- activa, y el histórico sigue completo.
-- ---------------------------------------------------------------------
do $$
declare v_actual uuid; v_interna uuid; n int; v_ant int;
begin
  select id into v_actual  from elecciones where estado = 'activa' and deleted_at is null
   order by fecha desc limit 1;
  select id into v_interna from elecciones where fecha = date '2026-06-07' and deleted_at is null;
  if v_actual is null or v_interna is null then return; end if;

  select count(*) into n from choferes
   where eleccion_id = v_actual and origen_planilla_id is not null;
  if n <> 0 then
    raise exception 'VERIFICACIÓN FALLIDA: quedaron % participaciones importadas en la elección activa', n;
  end if;

  select count(*) into n from choferes where eleccion_id = v_interna;
  select count(*) into v_ant from antecedentes where eleccion_id = v_interna;
  raise notice '  ✓ verificado: 0 importados en la elección activa';
  raise notice '  ✓ la interna conserva % participaciones y % antecedentes', n, v_ant;
end $$;

-- =====================================================================
-- REVERSIÓN  (no ejecutar salvo que haga falta volver atrás)
--
-- do $$
-- declare v_interna uuid; v_actual uuid;
-- begin
--   select id into v_interna from elecciones where fecha = date '2026-06-07';
--   select id into v_actual  from elecciones where estado = 'activa'
--    order by fecha desc limit 1;
--
--   update choferes set eleccion_id = v_actual
--    where eleccion_id = v_interna and origen_planilla_id is not null;
--   update asignaciones a set eleccion_id = v_actual
--    where a.eleccion_id = v_interna
--      and exists (select 1 from choferes ch where ch.id = a.chofer_id
--                   and ch.origen_planilla_id is not null);
--   update apariciones_origen set eleccion_id = v_actual
--    where eleccion_id = v_interna and origen_planilla_id is not null;
--   update dispositivos_gps d set eleccion_id = v_actual
--    where d.eleccion_id = v_interna
--      and exists (select 1 from choferes ch where ch.id = d.chofer_id
--                   and ch.origen_planilla_id is not null);
-- end $$;
-- =====================================================================
