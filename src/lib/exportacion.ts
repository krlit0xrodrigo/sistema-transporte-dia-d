/**
 * Núcleo de exportación — día 5.
 *
 * Tres reglas que no dependen de quién llame:
 *
 *  1. **Toda exportación queda registrada** en `exportaciones` ANTES de
 *     entregar el archivo. Si el registro falla, no hay archivo. La RLS de
 *     esa tabla exige `datos.exportar`, así que el insert *es* el control
 *     de permiso: no hay una segunda verificación en TypeScript que pueda
 *     desincronizarse de la base (ADR-01).
 *  2. **La cédula se enmascara** salvo que el usuario tenga
 *     `datos.exportar_pii`. Quien la exporta completa deja además un
 *     registro en `accesos_sensibles` (docs/security.md §4).
 *  3. **Límite de ritmo**: la propia tabla `exportaciones` es el contador.
 *     No hace falta tabla nueva ni estado en memoria — que además no
 *     sobreviviría a una función serverless.
 *
 * La consulta sale siempre de `v_choferes_ficha`, que es `security_invoker`:
 * un supervisor exporta su gente, no la de todos.
 */

import { crearClienteServidor } from "@/lib/supabase/server";
import { enmascararCI } from "@/lib/format";

/** Máximo de exportaciones por usuario dentro de la ventana. */
export const LIMITE_EXPORTACIONES = 20;
export const VENTANA_MINUTOS = 10;
/** Tope duro de filas por archivo: el operativo tiene ~600 choferes. */
export const MAX_FILAS = 5000;

export type TipoExport = "planilla" | "caja" | "folios";
export type FormatoExport = "xlsx" | "pdf" | "csv";

export interface Filtros {
  candidato?: string | null;
  barrio?: string | null;
  supervisor?: string | null;
  estado?: string | null;
}

export interface FilaPlanilla {
  chofer_id: string;
  ci: string;
  nombre_completo: string;
  telefono_e164: string | null;
  chapa: string | null;
  categoria: string | null;
  candidato: string | null;
  barrio: string | null;
  supervisor: string | null;
  responsable: string | null;
  estado_identidad: string;
  estado_servicio: string;
  contrato_firmado: boolean | null;
  vale_entregado: boolean | null;
  anticipo_pagado: boolean | null;
  pago_finalizado: boolean | null;
  actividad: string | null;
  numero_orden: number | null;
}

export interface Contexto {
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  usuarioId: string;
  organizacionId: string;
  eleccionId: string | null;
  nombre: string;
  puedeExportar: boolean;
  puedePII: boolean;
}

export class ErrorExportacion extends Error {
  constructor(mensaje: string, readonly estado = 400) {
    super(mensaje);
  }
}

/** Limpia los filtros: string vacío es "sin filtro", no un filtro por vacío. */
export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const uno = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    const t = (s ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    candidato: uno("candidato"),
    barrio: uno("barrio"),
    supervisor: uno("supervisor"),
    estado: uno("estado") ?? "activo",
  };
}

export function describirFiltros(f: Filtros): string {
  const partes = [
    f.candidato && `Candidato: ${f.candidato}`,
    f.barrio && `Barrio: ${f.barrio}`,
    f.supervisor && `Supervisor: ${f.supervisor}`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Todos los choferes";
}

export async function abrirContexto(): Promise<Contexto> {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ErrorExportacion("Sesión no iniciada.", 401);

  const [{ data: perfil }, { data: eleccion }, exp, pii] = await Promise.all([
    supabase.from("usuarios").select("organizacion_id, nombre_completo").eq("id", user.id).maybeSingle(),
    supabase.from("elecciones").select("id").eq("estado", "activa").maybeSingle(),
    supabase.rpc("auth_tiene_permiso", { p_codigo: "datos.exportar" }),
    supabase.rpc("auth_tiene_permiso", { p_codigo: "datos.exportar_pii" }),
  ]);

  if (!perfil) throw new ErrorExportacion("El usuario no tiene perfil en la organización.", 403);

  return {
    supabase,
    usuarioId: user.id,
    organizacionId: perfil.organizacion_id,
    eleccionId: eleccion?.id ?? null,
    nombre: perfil.nombre_completo ?? user.email ?? "—",
    puedeExportar: exp.data === true,
    puedePII: pii.data === true,
  };
}

/**
 * Límite de ritmo leído de la propia bitácora de exportaciones.
 * Es deliberadamente conservador: 20 archivos cada 10 minutos alcanza de
 * sobra para el uso real y frena un raspado del padrón hoja por hoja.
 */
export async function verificarCuota(ctx: Contexto): Promise<void> {
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000).toISOString();
  const { count } = await ctx.supabase
    .from("exportaciones")
    .select("*", { count: "exact", head: true })
    .eq("usuario_id", ctx.usuarioId)
    .gte("created_at", desde);

  if ((count ?? 0) >= LIMITE_EXPORTACIONES) {
    throw new ErrorExportacion(
      `Llegaste al límite de ${LIMITE_EXPORTACIONES} exportaciones cada ${VENTANA_MINUTOS} minutos. ` +
      "Esperá unos minutos y volvé a intentar.",
      429,
    );
  }
}

export async function consultarPlanilla(ctx: Contexto, f: Filtros): Promise<FilaPlanilla[]> {
  let q = ctx.supabase
    .from("v_choferes_ficha")
    .select(
      "chofer_id, ci, nombre_completo, telefono_e164, chapa, categoria, candidato, barrio, " +
      "supervisor, responsable, estado_identidad, estado_servicio, contrato_firmado, " +
      "vale_entregado, anticipo_pagado, pago_finalizado, actividad, numero_orden",
    )
    // La planilla es del operativo actual. El histórico de la interna del
    // 07/06/2026 no se imprime para repartir: se consulta en la ficha.
    .is("origen_planilla_id", null)
    .limit(MAX_FILAS);

  if (ctx.eleccionId) q = q.eq("eleccion_id", ctx.eleccionId);
  if (f.estado) q = q.eq("estado", f.estado);
  if (f.candidato) q = q.eq("candidato", f.candidato);
  if (f.barrio) q = q.eq("barrio", f.barrio);
  if (f.supervisor) q = q.eq("supervisor", f.supervisor);

  const { data, error } = await q.order("barrio").order("nombre_completo");
  if (error) throw new ErrorExportacion(error.message, 400);
  return (data ?? []) as unknown as FilaPlanilla[];
}

/** La cédula sale completa sólo con `datos.exportar_pii`. */
export function ciParaExportar(ctx: Contexto, ci: string): string {
  return ctx.puedePII ? ci : enmascararCI(ci);
}

/**
 * Registra la exportación y devuelve su id, que va impreso en el pie del
 * archivo. Si el insert falla por RLS, el usuario no tiene `datos.exportar`
 * y no hay archivo: el permiso se verifica escribiendo, no preguntando.
 */
export async function registrarExportacion(
  ctx: Contexto,
  datos: { tipo: TipoExport; formato: FormatoExport; filtros: Filtros; filas: number },
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("exportaciones")
    .insert({
      organizacion_id: ctx.organizacionId,
      usuario_id: ctx.usuarioId,
      tipo: datos.tipo,
      formato: datos.formato,
      filtros: { ...datos.filtros, eleccion_id: ctx.eleccionId },
      filas: datos.filas,
      incluye_pii: ctx.puedePII,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new ErrorExportacion(
      "Tu usuario no tiene permiso para exportar (`datos.exportar`).",
      403,
    );
  }

  if (ctx.puedePII) {
    // Exportar cédulas completas es un acceso sensible, no una descarga más.
    await ctx.supabase.from("accesos_sensibles").insert({
      organizacion_id: ctx.organizacionId,
      usuario_id: ctx.usuarioId,
      recurso: "pii",
      accion: "exportacion",
      contexto: { exportacion_id: data.id, tipo: datos.tipo, filas: datos.filas },
    });
  }

  return data.id as string;
}

/** Pie de trazabilidad, idéntico en XLSX y en papel. */
export function pieTrazabilidad(ctx: Contexto, exportacionId: string): string {
  const ahora = new Date().toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
  return `Exportado por ${ctx.nombre} · ${ahora} · id ${exportacionId}` +
    (ctx.puedePII ? "" : " · cédulas enmascaradas");
}

export const SI_NO = (v: boolean | null) => (v ? "SÍ" : "—");
