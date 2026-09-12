import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  Aviso, Badge, BotonEnlace, Card, CardHeader, Dato, Titulo, Vacio,
} from "@/components/ui";
import {
  ETIQUETA_ACTIVIDAD, ETIQUETA_IDENTIDAD,
  formatearCI, formatearFecha, formatearKm, formatearTelefono,
} from "@/lib/format";
import type { Aparicion, Antecedente, FichaChofer, ResultadoPadron } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * Ficha.
 *
 * La regla de esta pantalla: **operación actual y antecedentes históricos
 * nunca se mezclan en el mismo bloque.** Confundirlos es lo que llevó a
 * pagarle a gente que no trabajó y a discutir con gente que sí.
 *
 * Arriba, lo que la persona es HOY en el operativo del 4 de octubre.
 * Abajo, y claramente marcado como pasado, lo que hizo el 7 de junio.
 */

function Marca({ valor, si, no }: { valor: boolean | null; si: string; no: string }) {
  if (valor === null || valor === undefined) return <Badge tono="neutro">Sin registro</Badge>;
  return <Badge tono={valor ? "ok" : "alerta"}>{valor ? si : no}</Badge>;
}

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: ficha } = await supabase
    .from("v_choferes_ficha").select("*").eq("chofer_id", id).maybeSingle();
  if (!ficha) notFound();
  const c = ficha as FichaChofer & {
    origen_planilla_id: string | null; numero_orden: number | null;
    fecha_alta: string | null; eleccion_id: string;
  };

  // El padrón se consulta por RPC: deja rastro en accesos_sensibles.
  const [
    { data: padronRaw }, { data: apariciones }, { data: antecedentes },
    { data: eleccionActual }, { data: participaciones },
  ] = await Promise.all([
    supabase.rpc("fn_verificar_padron", { p_ci: c.ci }),
    supabase.from("apariciones_origen")
      .select("numero_fila, hoja, nombre_texto, candidato_texto, barrio_texto, fue_aplicada")
      .eq("persona_id", c.persona_id).order("numero_fila"),
    supabase.from("antecedentes")
      .select("resultado, km_recorridos, tuvo_gps, confiabilidad_dato, fuente, eleccion_id")
      .eq("persona_id", c.persona_id),
    supabase.from("elecciones").select("id, nombre").eq("estado", "activa").maybeSingle(),
    // ¿La misma persona tiene la otra mitad de la historia?
    supabase.from("v_choferes_ficha")
      .select("chofer_id, eleccion_id, origen_planilla_id, candidato, barrio, supervisor")
      .eq("persona_id", c.persona_id).neq("chofer_id", id),
  ]);

  const padron = (Array.isArray(padronRaw) ? padronRaw[0] : padronRaw) as ResultadoPadron | undefined;
  const aps = (apariciones ?? []) as Aparicion[];
  const ants = (antecedentes ?? []) as Antecedente[];

  const esHistorico = c.origen_planilla_id !== null;
  const enOperativoActual = !esHistorico && c.eleccion_id === eleccionActual?.id;

  type Otra = {
    chofer_id: string; eleccion_id: string; origen_planilla_id: string | null;
    candidato: string | null; barrio: string | null; supervisor: string | null;
  };
  const otras = (participaciones ?? []) as unknown as Otra[];
  const contraparteActual = otras.find(
    (o) => o.origen_planilla_id === null && o.eleccion_id === eleccionActual?.id);
  const contraparteHistorica = otras.find((o) => o.origen_planilla_id !== null);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/choferes" className="text-sm text-tinta-tenue underline underline-offset-4 hover:text-tinta">
          ← Choferes
        </Link>
        <div className="mt-2">
          <Titulo
            descripcion={
              <span className="tabular-nums">
                CI {formatearCI(c.ci)} · {formatearTelefono(c.telefono_e164)}
              </span>
            }
            accion={
              esHistorico && !contraparteActual
                ? <BotonEnlace href={`/choferes/nuevo?ci=${encodeURIComponent(c.ci)}`}>
                    Dar de alta en el operativo actual
                  </BotonEnlace>
                : undefined
            }
          >
            {c.nombre_completo}
          </Titulo>
        </div>
      </div>

      {/* Lo primero que tiene que quedar claro: qué es esta ficha. */}
      {esHistorico ? (
        <Aviso tono="info">
          <strong>Participación histórica — interna del 7 de junio de 2026.</strong>{" "}
          No es el operativo del 4 de octubre. Sirve para saber qué hizo esta persona antes.
          {contraparteActual ? (
            <> Esta persona <Link href={`/choferes/${contraparteActual.chofer_id}`}
                 className="font-semibold underline underline-offset-2">ya está en el operativo actual</Link>.</>
          ) : (
            <> Todavía no fue dada de alta en el operativo actual.</>
          )}
        </Aviso>
      ) : enOperativoActual ? (
        <Aviso tono="ok">
          <strong>Operativo actual — Día D, 4 de octubre de 2026.</strong>
          {c.numero_orden && <> Orden n.º <span className="tabular-nums">{c.numero_orden}</span>.</>}
          {c.fecha_alta && <> Alta del {formatearFecha(c.fecha_alta)}.</>}
        </Aviso>
      ) : null}

      {c.estado_identidad !== "verificada" && (
        <Aviso tono="alerta">
          {ETIQUETA_IDENTIDAD[c.estado_identidad]}
          {padron?.encontrado && padron.nombre_completo && (
            <> · En el padrón figura como <strong>{padron.nombre_completo}</strong></>
          )}
        </Aviso>
      )}

      {/* ------------------------------------------------ OPERACIÓN */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
          <span className="h-4 w-1 rounded bg-rojo" aria-hidden="true" />
          {esHistorico ? "Cómo figuraba en junio" : "Operación actual"}
        </h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader titulo="Asignación" />
            <dl className="grid grid-cols-2 gap-4 p-4">
              <Dato etiqueta="Candidato">{c.candidato ?? "—"}</Dato>
              <Dato etiqueta="Barrio">{c.barrio ?? "—"}</Dato>
              <Dato etiqueta="Supervisor">{c.supervisor ?? "—"}</Dato>
              <Dato etiqueta="Responsable">
                {c.responsable ?? "—"}
                {c.responsable_tipo && <span className="text-tinta-tenue"> · {c.responsable_tipo}</span>}
              </Dato>
              <Dato etiqueta="Estado de servicio"><Badge>{c.estado_servicio}</Badge></Dato>
              <Dato etiqueta="Vehículo">{c.chapa ? `${c.chapa} · ${c.categoria ?? ""}` : "—"}</Dato>
            </dl>
          </Card>

          <Card>
            <CardHeader titulo="Padrón" extra={<span className="text-xs text-tinta-tenue">consulta registrada</span>} />
            {padron?.encontrado ? (
              <dl className="grid grid-cols-2 gap-4 p-4">
                <Dato etiqueta="Local">{padron.local_nombre ?? "—"}</Dato>
                <Dato etiqueta="Mesa">{padron.mesa ?? "—"}</Dato>
                <Dato etiqueta="Orden">{padron.orden ?? "—"}</Dato>
                <Dato etiqueta="Seccional">{padron.seccional ?? "—"}</Dato>
                <div className="col-span-2"><Dato etiqueta="Dirección">{padron.direccion ?? "—"}</Dato></div>
              </dl>
            ) : (
              <Vacio mensaje="No figura en el padrón de Villa Hayes." />
            )}
          </Card>

          {!esHistorico && (
            <Card className="lg:col-span-2">
              <CardHeader titulo="Contrato y caja" />
              <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <Dato etiqueta="Contrato"><Marca valor={c.contrato_firmado} si="Firmado" no="Sin firmar" /></Dato>
                <Dato etiqueta="Vale de combustible"><Marca valor={c.vale_entregado} si="Entregado" no="Sin entregar" /></Dato>
                <Dato etiqueta="Anticipo"><Marca valor={c.anticipo_pagado} si="Pagado" no="Sin pagar" /></Dato>
                <Dato etiqueta="Pago final"><Marca valor={c.pago_finalizado} si="Finalizado" no="Pendiente" /></Dato>
              </dl>
            </Card>
          )}
        </div>
      </section>

      {/* --------------------------------------------- ANTECEDENTES */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
          <span className="h-4 w-1 rounded bg-zinc-300" aria-hidden="true" />
          Antecedentes — interna del 7 de junio de 2026
        </h2>

        <Card>
          {ants.length === 0 && !contraparteHistorica ? (
            <Vacio mensaje="Sin antecedentes registrados"
                   detalle="Esta persona no figura en el reporte de la interna del 7 de junio." />
          ) : (
            <div className="space-y-4 p-4">
              {contraparteHistorica && (
                <div className="rounded-lg bg-zinc-50 p-3 text-sm">
                  <p className="text-tinta-suave">
                    En junio figuraba con{" "}
                    <strong className="text-tinta">{contraparteHistorica.candidato ?? "sin candidato"}</strong>
                    {contraparteHistorica.barrio && <> en <strong className="text-tinta">{contraparteHistorica.barrio}</strong></>}
                    {contraparteHistorica.supervisor && <>, supervisado por <strong className="text-tinta">{contraparteHistorica.supervisor}</strong></>}.
                  </p>
                  <Link href={`/choferes/${contraparteHistorica.chofer_id}`}
                        className="mt-1 inline-block text-xs font-medium text-rojo-700 underline underline-offset-2">
                    Ver la ficha histórica completa
                  </Link>
                </div>
              )}

              {ants.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-sm first:border-0 first:pt-0">
                  <span className="flex items-center gap-3">
                    <Badge tono={a.resultado === "cumplio" ? "ok" : "alerta"}>
                      {a.resultado === "cumplio" ? "Trabajó" : "No trabajó"}
                    </Badge>
                    <span className="text-tinta-suave">{formatearKm(a.km_recorridos)}</span>
                    <span className="text-tinta-tenue">{a.tuvo_gps ? "con GPS" : "sin GPS"}</span>
                  </span>
                  {a.confiabilidad_dato === "baja" && (
                    <Badge tono="alerta">confiabilidad baja</Badge>
                  )}
                </div>
              ))}

              {ants.some((a) => a.confiabilidad_dato === "baja") && (
                <p className="border-t border-zinc-100 pt-3 text-xs text-tinta-tenue">
                  El reporte del 07/06/2026 no trae cédula: el cruce se hizo por nombre, y el
                  maestro tiene 52 nombres repetidos. Sirve para ver antecedentes,
                  <strong className="text-tinta"> no para decidir un pago.</strong>
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Actividad GPS del operativo en curso, sólo si es la ficha actual. */}
        {!esHistorico && (
          <Card>
            <CardHeader titulo="Actividad GPS del operativo actual" />
            <dl className="grid grid-cols-2 gap-4 p-4">
              <Dato etiqueta="Clasificación">
                {c.actividad ? ETIQUETA_ACTIVIDAD[c.actividad] : "Sin datos"}
              </Dato>
              <Dato etiqueta="Kilómetros">{formatearKm(c.km_recorridos)}</Dato>
            </dl>
            <p className="px-4 pb-3 text-xs text-tinta-tenue">
              Se calcula con la ingesta de Traccar, que corre el Día D. Hasta entonces todos
              los choferes figuran en <code>sin_datos</code>.
            </p>
          </Card>
        )}
      </section>

      {aps.length > 1 && (
        <Card>
          <CardHeader titulo={`Esta cédula apareció ${aps.length} veces en las planillas`} />
          <ul className="divide-y divide-zinc-100">
            {aps.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <Badge tono={a.fue_aplicada ? "ok" : "neutro"}>
                  {a.fue_aplicada ? "Aplicada" : "Archivada"}
                </Badge>
                <span className="text-tinta-tenue">fila {a.numero_fila ?? "—"}</span>
                <span>{a.candidato_texto || "(sin candidato)"}</span>
                <span className="text-tinta-tenue">· {a.barrio_texto || "(sin barrio)"}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-xs text-tinta-tenue">
            Ninguna aparición se borra: quedan como evidencia de cómo figuraba en el origen.
          </p>
        </Card>
      )}
    </div>
  );
}
