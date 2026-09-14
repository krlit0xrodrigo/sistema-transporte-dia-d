import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dato, PageHeader, Aviso } from "@/components/shared";
import {
  formatearCI, formatearTelefono, formatearKm, formatearFecha,
  ETIQUETA_IDENTIDAD, ETIQUETA_ACTIVIDAD,
} from "@/lib/format";
import {
  ArrowLeft, UserPlus, CheckCircle, XCircle, AlertTriangle,
  MapPin, ShieldAlert, History, FileSignature, Fuel, Banknote,
  CreditCard, Info, Navigation,
} from "lucide-react";
import type {
  Antecedente, Aparicion, FichaChofer, ResultadoPadron,
} from "@/types/database";
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ ci: string }> },
): Promise<Metadata> {
  const { ci } = await params;
  return { title: `CI ${ci} — Consulta` };
}

/**
 * PUERTA 1 — Ficha de persona.
 *
 * Centrada en la PERSONA, no en el chofer. Muestra todo lo que el sistema
 * sabe de una cédula, separado en secciones que nunca se mezclan:
 *
 * 1. Datos personales (CI, nombre, teléfono, estado de identidad)
 * 2. Padrón electoral (local, mesa, orden)
 * 3. Operación actual (si es chofer activo)
 * 4. Antecedentes históricos (elecciones anteriores)
 * 5. Lista negra (si aplica)
 * 6. Asignación, vehículo, GPS, caja (si es chofer activo)
 *
 * Regla fundamental: operación actual y antecedentes NUNCA se mezclan
 * en el mismo bloque.
 */

/** Color semáforo para estado visual */
function StatusDot({ color }: { color: "green" | "yellow" | "red" | "blue" }) {
  const colors = {
    green: "bg-success",
    yellow: "bg-warning",
    red: "bg-danger",
    blue: "bg-info",
  };
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${colors[color]}`} aria-hidden="true" />
  );
}

export default async function FichaPersona(
  { params }: { params: Promise<{ ci: string }> },
) {
  const { ci: ciParam } = await params;
  const ci = decodeURIComponent(ciParam).replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (!ci) notFound();

  const supabase = await crearClienteServidor();

  // Buscar la persona por CI
  const { data: persona } = await supabase
    .from("personas")
    .select("id, ci, nombres, apellidos, nombre_completo, telefono_e164, estado_identidad, barrio_residencia_id")
    .eq("ci", ci)
    .is("deleted_at", null)
    .maybeSingle();

  if (!persona) {
    // Persona no encontrada: verificar en el padrón
    const { data: padronRaw } = await supabase.rpc("fn_verificar_padron", { p_ci: ci });
    const padron = (Array.isArray(padronRaw) ? padronRaw[0] : padronRaw) as ResultadoPadron | undefined;

    return (
      <div className="space-y-6">
        <div>
          <Link href="/consulta" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Consulta
          </Link>
          <PageHeader descripcion={`CI ${formatearCI(ci)}`}>
            Persona no registrada
          </PageHeader>
        </div>

        {padron?.encontrado ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <StatusDot color="yellow" /> Encontrada en el padrón pero no registrada en el sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Dato etiqueta="Nombre en padrón">{padron.nombre_completo ?? "—"}</Dato>
                <Dato etiqueta="Local">{padron.local_nombre ?? "—"}</Dato>
                <Dato etiqueta="Mesa">{padron.mesa ?? "—"}</Dato>
                <Dato etiqueta="Orden">{padron.orden ?? "—"}</Dato>
                <Dato etiqueta="Seccional">{padron.seccional ?? "—"}</Dato>
                <Dato etiqueta="Dirección">{padron.direccion ?? "—"}</Dato>
              </dl>
              <div className="mt-4">
                <Button asChild>
                  <Link href={`/alta?ci=${encodeURIComponent(ci)}`}>
                    <UserPlus className="h-4 w-4" /> Dar de alta como chofer
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Aviso tono="alerta">
            La cédula <strong className="tabular-nums">{formatearCI(ci)}</strong> no está registrada
            en el sistema ni figura en el padrón de Villa Hayes.
          </Aviso>
        )}
      </div>
    );
  }

  // ── Persona encontrada — cargar todo en paralelo ──
  const [
    { data: padronRaw },
    { data: choferes },
    { data: antecedentes },
    { data: eleccionActual },
    { data: listaNegra },
  ] = await Promise.all([
    supabase.rpc("fn_verificar_padron", { p_ci: persona.ci }),
    supabase.from("v_choferes_ficha")
      .select("*")
      .eq("persona_id", persona.id)
      .is("deleted_at", null),
    supabase.from("antecedentes")
      .select("resultado, km_recorridos, tuvo_gps, confiabilidad_dato, fuente, eleccion_id")
      .eq("persona_id", persona.id),
    supabase.from("elecciones").select("id, nombre").eq("estado", "activa").maybeSingle(),
    supabase.from("lista_negra")
      .select("id, motivo, vigente_desde, vigente_hasta, estado")
      .eq("persona_id", persona.id)
      .eq("estado", "vigente"),
  ]);

  const padron = (Array.isArray(padronRaw) ? padronRaw[0] : padronRaw) as ResultadoPadron | undefined;
  const ants = (antecedentes ?? []) as Antecedente[];
  const listaNegraVigente = (listaNegra ?? []) as { id: string; motivo: string; estado: string }[];

  // Separar chofer actual vs histórico
  type ChoferFicha = FichaChofer & {
    origen_planilla_id: string | null;
    numero_orden: number | null;
    fecha_alta: string | null;
    eleccion_id: string;
  };

  const todosChoferes = (choferes ?? []) as unknown as ChoferFicha[];
  const choferActual = todosChoferes.find(
    (c) => c.origen_planilla_id === null && c.eleccion_id === eleccionActual?.id,
  );
  const choferesHistoricos = todosChoferes.filter(
    (c) => c.origen_planilla_id !== null,
  );

  const tieneListaNegra = listaNegraVigente.length > 0;
  const tieneAntecedentes = ants.length > 0 || choferesHistoricos.length > 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/consulta" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Consulta
        </Link>
        <div className="mt-2">
          <PageHeader
            descripcion={
              <span className="tabular-nums">
                CI {formatearCI(persona.ci)} · {formatearTelefono(persona.telefono_e164)}
              </span>
            }
            accion={
              !choferActual && (
                <Button asChild>
                  <Link href={`/alta?ci=${encodeURIComponent(persona.ci)}`}>
                    <UserPlus className="h-4 w-4" /> Dar de alta
                  </Link>
                </Button>
              )
            }
          >
            {persona.nombre_completo}
          </PageHeader>
        </div>
      </div>

      {/* ═══════ ALERTAS (arriba de todo) ═══════ */}
      {tieneListaNegra && (
        <Aviso tono="error">
          <strong>⛔ Lista negra vigente.</strong> Esta persona tiene {listaNegraVigente.length} registro(s)
          activo(s) en la lista negra. No puede ser dada de alta sin excepción.
        </Aviso>
      )}

      {persona.estado_identidad !== "verificada" && (
        <Aviso tono="alerta">
          {ETIQUETA_IDENTIDAD[persona.estado_identidad]}
          {padron?.encontrado && padron.nombre_completo && (
            <> · En el padrón figura como <strong>{padron.nombre_completo}</strong></>
          )}
        </Aviso>
      )}

      {/* ═══════ SECCIÓN 1: DATOS PERSONALES + PADRÓN ═══════ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Datos personales */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <StatusDot color={persona.estado_identidad === "verificada" ? "green" : "yellow"} />
              Datos personales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Dato etiqueta="CI">
                <span className="tabular-nums font-semibold">{formatearCI(persona.ci)}</span>
              </Dato>
              <Dato etiqueta="Teléfono">
                <span className="tabular-nums">{formatearTelefono(persona.telefono_e164)}</span>
              </Dato>
              <Dato etiqueta="Nombres">{persona.nombres}</Dato>
              <Dato etiqueta="Apellidos">{persona.apellidos}</Dato>
              <Dato etiqueta="Identidad">
                <Badge variant={persona.estado_identidad === "verificada" ? "success" : "warning"}>
                  {persona.estado_identidad === "verificada" ? "Verificada"
                    : persona.estado_identidad === "fuera_de_padron" ? "Fuera de padrón"
                    : "Discrepancia"}
                </Badge>
              </Dato>
            </dl>
          </CardContent>
        </Card>

        {/* Padrón */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <StatusDot color={padron?.encontrado ? "green" : "yellow"} />
              Padrón electoral
              <span className="ml-auto text-[11px] font-normal text-muted-foreground">consulta registrada</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {padron?.encontrado ? (
              <dl className="grid grid-cols-2 gap-4">
                <Dato etiqueta="Local">{padron.local_nombre ?? "—"}</Dato>
                <Dato etiqueta="Mesa">{padron.mesa ?? "—"}</Dato>
                <Dato etiqueta="Orden">{padron.orden ?? "—"}</Dato>
                <Dato etiqueta="Seccional">{padron.seccional ?? "—"}</Dato>
                <div className="col-span-2">
                  <Dato etiqueta="Dirección">{padron.direccion ?? "—"}</Dato>
                </div>
              </dl>
            ) : (
              <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5 text-warning" />
                No figura en el padrón de Villa Hayes.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ SECCIÓN 2: OPERACIÓN ACTUAL ═══════ */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="h-4 w-1 rounded bg-primary" aria-hidden="true" />
          Operación actual — 4 de octubre de 2026
        </h2>

        {choferActual ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Estado */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <StatusDot color="green" /> Chofer activo
                  {choferActual.numero_orden && (
                    <Badge variant="outline" className="ml-auto tabular-nums">
                      Orden n.º {choferActual.numero_orden}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <Dato etiqueta="Candidato">{choferActual.candidato ?? "—"}</Dato>
                  <Dato etiqueta="Barrio">{choferActual.barrio ?? "—"}</Dato>
                  <Dato etiqueta="Supervisor">{choferActual.supervisor ?? "—"}</Dato>
                  <Dato etiqueta="Responsable">
                    {choferActual.responsable ?? "—"}
                    {choferActual.responsable_tipo && (
                      <span className="text-muted-foreground"> · {choferActual.responsable_tipo}</span>
                    )}
                  </Dato>
                  <Dato etiqueta="Estado servicio">
                    <Badge variant="secondary">{choferActual.estado_servicio}</Badge>
                  </Dato>
                  <Dato etiqueta="Vehículo">
                    {choferActual.chapa ? `${choferActual.chapa} · ${choferActual.categoria ?? ""}` : "—"}
                  </Dato>
                </dl>
              </CardContent>
            </Card>

            {/* Caja */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Contrato y caja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <Dato etiqueta="Contrato">
                    <CajaEstado valor={choferActual.contrato_firmado} si="Firmado" no="Sin firmar" />
                  </Dato>
                  <Dato etiqueta="Combustible">
                    <CajaEstado valor={choferActual.vale_entregado} si="Entregado" no="Sin entregar" />
                  </Dato>
                  <Dato etiqueta="Anticipo">
                    <CajaEstado valor={choferActual.anticipo_pagado} si="Pagado" no="Sin pagar" />
                  </Dato>
                  <Dato etiqueta="Pago final">
                    <CajaEstado valor={choferActual.pago_finalizado} si="Finalizado" no="Pendiente" />
                  </Dato>
                </dl>
              </CardContent>
            </Card>

            {/* GPS */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Navigation className="h-4 w-4 text-muted-foreground" />
                  Actividad GPS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Dato etiqueta="Clasificación">
                    {choferActual.actividad ? ETIQUETA_ACTIVIDAD[choferActual.actividad] : "Sin datos"}
                  </Dato>
                  <Dato etiqueta="Kilómetros">{formatearKm(choferActual.km_recorridos)}</Dato>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Se calcula con la ingesta de Traccar, que corre el Día D.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <Info className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Esta persona no tiene alta en el operativo actual.
              </p>
              {!tieneListaNegra && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/alta?ci=${encodeURIComponent(persona.ci)}`}>
                    <UserPlus className="h-4 w-4" /> Dar de alta como chofer
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ═══════ SECCIÓN 3: ANTECEDENTES (separados del operativo) ═══════ */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="h-4 w-1 rounded bg-muted-foreground/40" aria-hidden="true" />
          Antecedentes — interna del 7 de junio de 2026
        </h2>

        <Card>
          {!tieneAntecedentes ? (
            <CardContent className="py-8 text-center">
              <History className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Sin antecedentes registrados. Esta persona no figura en el reporte de la interna.
              </p>
            </CardContent>
          ) : (
            <CardContent className="space-y-4 pt-6">
              {/* Participación histórica */}
              {choferesHistoricos.length > 0 && (
                <div className="rounded-lg bg-accent p-3 text-sm">
                  <p className="text-muted-foreground">
                    En junio figuraba con{" "}
                    <strong className="text-foreground">{choferesHistoricos[0]?.candidato ?? "sin candidato"}</strong>
                    {choferesHistoricos[0]?.barrio && (
                      <> en <strong className="text-foreground">{choferesHistoricos[0].barrio}</strong></>
                    )}
                    {choferesHistoricos[0]?.supervisor && (
                      <>, supervisado por <strong className="text-foreground">{choferesHistoricos[0].supervisor}</strong></>
                    )}.
                  </p>
                  <Link
                    href={`/choferes/${choferesHistoricos[0]?.chofer_id}`}
                    className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-2"
                  >
                    Ver ficha histórica completa
                  </Link>
                </div>
              )}

              {/* Resultados */}
              {ants.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm first:border-0 first:pt-0">
                  <span className="flex items-center gap-3">
                    <Badge variant={a.resultado === "cumplio" ? "success" : "warning"}>
                      {a.resultado === "cumplio" ? "Trabajó" : "No trabajó"}
                    </Badge>
                    <span className="text-muted-foreground">{formatearKm(a.km_recorridos)}</span>
                    <span className="text-muted-foreground/70">{a.tuvo_gps ? "con GPS" : "sin GPS"}</span>
                  </span>
                  {a.confiabilidad_dato === "baja" && (
                    <Badge variant="warning">confiabilidad baja</Badge>
                  )}
                </div>
              ))}

              {ants.some((a) => a.confiabilidad_dato === "baja") && (
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  El reporte del 07/06/2026 no trae cédula: el cruce se hizo por nombre, y el
                  maestro tiene 52 nombres repetidos. Sirve para ver antecedentes,
                  <strong className="text-foreground"> no para decidir un pago.</strong>
                </p>
              )}
            </CardContent>
          )}
        </Card>
      </section>

      {/* ═══════ SECCIÓN 4: LISTA NEGRA ═══════ */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span className={`h-4 w-1 rounded ${tieneListaNegra ? "bg-danger" : "bg-success"}`} aria-hidden="true" />
          Lista negra
        </h2>

        <Card>
          <CardContent className="py-4">
            {tieneListaNegra ? (
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div>
                  <p className="text-sm font-medium text-danger">
                    {listaNegraVigente.length} registro(s) vigente(s)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No puede ser dada de alta sin excepción aprobada.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-success" />
                <p className="text-sm text-muted-foreground">No figura en la lista negra.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function CajaEstado({ valor, si, no }: { valor: boolean | null; si: string; no: string }) {
  if (valor === null || valor === undefined) {
    return <Badge variant="secondary">Sin registro</Badge>;
  }
  return (
    <Badge variant={valor ? "success" : "outline"}>
      {valor ? (
        <><CheckCircle className="mr-1 h-3 w-3" /> {si}</>
      ) : (
        <><XCircle className="mr-1 h-3 w-3" /> {no}</>
      )}
    </Badge>
  );
}
