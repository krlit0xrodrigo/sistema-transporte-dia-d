/**
 * Exportación XLSX — día 5.
 *
 *   GET /api/exportar/xlsx?tipo=planilla&barrio=...&candidato=...
 *
 * Tres tipos: `planilla` (la hoja de ruta del barrio), `caja` (estado de
 * contrato / vale / anticipo / pago) y `folios` (control de talonarios).
 *
 * El archivo se arma en memoria y se devuelve como descarga. No se guarda
 * en el servidor: lo que queda es el renglón en `exportaciones`, que es lo
 * que después permite responder "quién se llevó los datos y cuándo".
 */

import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import {
  ErrorExportacion, SI_NO, abrirContexto, ciParaExportar, consultarPlanilla,
  describirFiltros, leerFiltros, pieTrazabilidad, registrarExportacion, verificarCuota,
  type Contexto, type Filtros, type TipoExport,
} from "@/lib/exportacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: TipoExport[] = ["planilla", "caja", "folios"];

const CABECERA = { bold: true, color: { argb: "FFFFFFFF" } } as const;
const RELLENO_CABECERA = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" },
} as const;

function hoja(wb: ExcelJS.Workbook, nombre: string, columnas: Array<{ header: string; key: string; width: number }>) {
  const ws = wb.addWorksheet(nombre, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = columnas;
  const fila = ws.getRow(1);
  fila.font = CABECERA;
  fila.fill = RELLENO_CABECERA as ExcelJS.Fill;
  fila.alignment = { vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

function cerrarConPie(ws: ExcelJS.Worksheet, pie: string, columnas: number) {
  ws.addRow([]);
  const fila = ws.addRow([pie]);
  fila.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  ws.mergeCells(fila.number, 1, fila.number, columnas);
}

// ------------------------------------------------------------- planilla
async function construirPlanilla(ctx: Contexto, f: Filtros, wb: ExcelJS.Workbook) {
  const filas = await consultarPlanilla(ctx, f);
  const columnas = [
    { header: "#", key: "n", width: 5 },
    { header: "Cédula", key: "ci", width: 14 },
    { header: "Nombre completo", key: "nombre", width: 34 },
    { header: "Teléfono", key: "tel", width: 14 },
    { header: "Chapa", key: "chapa", width: 12 },
    { header: "Tipo", key: "cat", width: 12 },
    { header: "Candidato", key: "cand", width: 24 },
    { header: "Barrio", key: "barrio", width: 20 },
    { header: "Supervisor", key: "sup", width: 20 },
    { header: "Responsable", key: "resp", width: 20 },
    { header: "Padrón", key: "padron", width: 16 },
    { header: "Contrato", key: "co", width: 10 },
    { header: "Vale", key: "va", width: 10 },
    { header: "Anticipo", key: "an", width: 10 },
    { header: "Pago final", key: "pf", width: 11 },
    { header: "Firma", key: "firma", width: 22 },
  ];
  const ws = hoja(wb, "Planilla", columnas);

  filas.forEach((r, i) => ws.addRow({
    n: i + 1,
    ci: ciParaExportar(ctx, r.ci),
    nombre: r.nombre_completo,
    tel: ctx.puedePII ? (r.telefono_e164 ?? "") : "",
    chapa: r.chapa ?? "",
    cat: r.categoria ?? "",
    cand: r.candidato ?? "",
    barrio: r.barrio ?? "",
    sup: r.supervisor ?? "",
    resp: r.responsable ?? "",
    padron: r.estado_identidad === "verificada" ? "Verificado"
      : r.estado_identidad === "fuera_de_padron" ? "Fuera del padrón" : "Discrepancia",
    co: SI_NO(r.contrato_firmado),
    va: SI_NO(r.vale_entregado),
    an: SI_NO(r.anticipo_pagado),
    pf: SI_NO(r.pago_finalizado),
    firma: "",
  }));

  return { ws, filas: filas.length, columnas: columnas.length };
}

// ----------------------------------------------------------------- caja
async function construirCaja(ctx: Contexto, f: Filtros, wb: ExcelJS.Workbook) {
  let q = ctx.supabase
    .from("v_caja")
    .select("ci, nombre_completo, candidato, contrato_firmado, fecha_firma, vale_entregado, anticipo_pagado, pago_finalizado, actividad")
    .limit(5000);
  if (f.candidato) q = q.eq("candidato", f.candidato);
  const { data, error } = await q.order("nombre_completo");
  if (error) throw new ErrorExportacion(error.message, 400);

  const columnas = [
    { header: "Cédula", key: "ci", width: 14 },
    { header: "Nombre completo", key: "nombre", width: 34 },
    { header: "Candidato", key: "cand", width: 24 },
    { header: "Contrato", key: "co", width: 10 },
    { header: "Fecha de firma", key: "fecha", width: 18 },
    { header: "Vale", key: "va", width: 10 },
    { header: "Anticipo", key: "an", width: 10 },
    { header: "Pago final", key: "pf", width: 11 },
    { header: "Actividad GPS", key: "act", width: 16 },
  ];
  const ws = hoja(wb, "Caja", columnas);

  type FilaCaja = {
    ci: string; nombre_completo: string; candidato: string | null;
    contrato_firmado: boolean; fecha_firma: string | null; vale_entregado: boolean;
    anticipo_pagado: boolean; pago_finalizado: boolean; actividad: string | null;
  };

  (data as FilaCaja[] ?? []).forEach((r) => ws.addRow({
    ci: ciParaExportar(ctx, r.ci),
    nombre: r.nombre_completo,
    cand: r.candidato ?? "",
    co: SI_NO(r.contrato_firmado),
    fecha: r.fecha_firma ? new Date(r.fecha_firma).toLocaleString("es-PY") : "",
    va: SI_NO(r.vale_entregado),
    an: SI_NO(r.anticipo_pagado),
    pf: SI_NO(r.pago_finalizado),
    act: r.actividad ?? "sin datos",
  }));

  // Los montos quedan fuera a propósito: son opcionales (D-16) y su
  // exportación requiere `reportes.ver_montos`, que se resuelve después
  // del Día D junto con el libro de caja.
  return { ws, filas: data?.length ?? 0, columnas: columnas.length };
}

// --------------------------------------------------------------- folios
async function construirFolios(ctx: Contexto, wb: ExcelJS.Workbook) {
  const { data, error } = await ctx.supabase
    .from("v_folios_series")
    .select("tipo_documento, prefijo, desde, hasta, estado, total, disponibles, usados, anulados")
    .order("tipo_documento");
  if (error) throw new ErrorExportacion(error.message, 400);

  const columnas = [
    { header: "Documento", key: "tipo", width: 20 },
    { header: "Prefijo", key: "pre", width: 10 },
    { header: "Desde", key: "desde", width: 10 },
    { header: "Hasta", key: "hasta", width: 10 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Total", key: "total", width: 10 },
    { header: "Disponibles", key: "disp", width: 13 },
    { header: "Usados", key: "usados", width: 10 },
    { header: "Anulados", key: "anul", width: 10 },
  ];
  const ws = hoja(wb, "Folios", columnas);

  type FilaSerie = {
    tipo_documento: string; prefijo: string; desde: number; hasta: number;
    estado: string; total: number; disponibles: number; usados: number; anulados: number;
  };

  (data as FilaSerie[] ?? []).forEach((r) => ws.addRow({
    tipo: r.tipo_documento, pre: r.prefijo, desde: r.desde, hasta: r.hasta,
    estado: r.estado, total: r.total, disp: r.disponibles, usados: r.usados, anul: r.anulados,
  }));

  return { ws, filas: data?.length ?? 0, columnas: columnas.length };
}

// ----------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tipo = (sp.get("tipo") ?? "planilla") as TipoExport;
    if (!TIPOS.includes(tipo)) throw new ErrorExportacion("Tipo de exportación desconocido.", 400);

    const filtros = leerFiltros(Object.fromEntries(sp.entries()));
    const ctx = await abrirContexto();
    await verificarCuota(ctx);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Logística Día D";
    wb.created = new Date();

    const armado =
      tipo === "planilla" ? await construirPlanilla(ctx, filtros, wb)
      : tipo === "caja" ? await construirCaja(ctx, filtros, wb)
      : await construirFolios(ctx, wb);

    // El registro va ANTES de entregar el archivo: si no se puede
    // registrar, no se exporta.
    const exportacionId = await registrarExportacion(ctx, {
      tipo, formato: "xlsx", filtros, filas: armado.filas,
    });

    cerrarConPie(
      armado.ws,
      `${describirFiltros(filtros)} — ${armado.filas} filas · ${pieTrazabilidad(ctx, exportacionId)}`,
      armado.columnas,
    );

    const buffer = await wb.xlsx.writeBuffer();
    const sello = new Date().toISOString().slice(0, 10);
    const nombre = `dia-d-${tipo}-${sello}.xlsx`;

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    const err = e instanceof ErrorExportacion ? e : new ErrorExportacion("Error al exportar.", 500);
    if (!(e instanceof ErrorExportacion)) console.error("exportar/xlsx", e);
    return NextResponse.json({ error: err.message }, { status: err.estado });
  }
}
