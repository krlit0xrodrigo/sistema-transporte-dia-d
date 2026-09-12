/**
 * Planilla imprimible — el plan B en papel.
 *
 * Por qué HTML y no una librería de PDF: el navegador ya sabe paginar,
 * numerar y llevar la cabecera a cada hoja. Meter puppeteer o pdfkit en
 * Vercel agrega 300 MB de dependencias y un binario de Chrome para
 * reproducir lo que `@media print` hace nativo. Si el 2 de octubre hay que
 * imprimir 600 planillas, se abre esta página y se manda a la impresora;
 * "Guardar como PDF" del propio navegador da el archivo.
 *
 * Un corte de página por barrio: cada supervisor se lleva su hoja.
 */

import {
  ErrorExportacion, SI_NO, abrirContexto, ciParaExportar, consultarPlanilla,
  describirFiltros, leerFiltros, pieTrazabilidad, registrarExportacion, verificarCuota,
  type Contexto, type FilaPlanilla, type Filtros,
} from "@/lib/exportacion";
import { formatearCI, formatearTelefono } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

type Preparado =
  | { ok: true; ctx: Contexto; filas: FilaPlanilla[]; exportacionId: string }
  | { ok: false; error: string };

async function preparar(filtros: Filtros): Promise<Preparado> {
  try {
    const ctx = await abrirContexto();
    await verificarCuota(ctx);
    const filas = await consultarPlanilla(ctx, filtros);
    // Abrir la vista de impresión ES una exportación: queda registrada
    // igual que la descarga del XLSX.
    const exportacionId = await registrarExportacion(ctx, {
      tipo: "planilla", formato: "pdf", filtros, filas: filas.length,
    });
    return { ok: true, ctx, filas, exportacionId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ErrorExportacion ? e.message : "No se pudo generar la planilla.",
    };
  }
}

export default async function PlanillaImprimible({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filtros = leerFiltros(sp);

  const resultado = await preparar(filtros);
  if (!resultado.ok) {
    return (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-lg font-semibold text-rose-700">No se pudo generar la planilla</h1>
        <p className="mt-2 text-sm text-slate-700">{resultado.error}</p>
      </main>
    );
  }
  const { ctx, filas, exportacionId } = resultado;

  // Agrupación por barrio: el barrio es la unidad de reparto en el terreno.
  const grupos = new Map<string, FilaPlanilla[]>();
  for (const f of filas) {
    const clave = f.barrio ?? "Sin barrio asignado";
    const acumulado = grupos.get(clave);
    if (acumulado) acumulado.push(f);
    else grupos.set(clave, [f]);
  }
  const pie = pieTrazabilidad(ctx, exportacionId);

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 12mm 10mm 14mm 10mm; }
        @media print {
          .no-imprimir { display: none !important; }
          .hoja { break-after: page; }
          .hoja:last-child { break-after: auto; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
        .planilla { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; }
        .planilla table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        .planilla th, .planilla td { border: 0.5pt solid #94a3b8; padding: 3pt 4pt; text-align: left; }
        .planilla th { background: #e2e8f0; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; }
        .planilla td.firma { min-width: 38mm; }
      `}</style>

      <div className="no-imprimir border-b border-slate-200 bg-slate-50 px-6 py-3 text-sm text-slate-600">
        {filas.length} choferes en {grupos.size} {grupos.size === 1 ? "barrio" : "barrios"} ·{" "}
        {describirFiltros(filtros)} — una hoja por barrio.
        {!ctx.puedePII && " Las cédulas salen enmascaradas: tu usuario no tiene datos.exportar_pii."}
        <span className="ml-2">Imprimí con Ctrl/⌘+P.</span>
      </div>

      <div className="planilla p-6 print:p-0">
        {[...grupos.entries()].map(([barrio, lista]) => (
          <section key={barrio} className="hoja mb-10">
            <header className="mb-2 flex items-end justify-between border-b-2 border-slate-900 pb-1">
              <div>
                <h1 className="text-base font-bold">Planilla de choferes — {barrio}</h1>
                <p className="text-xs text-slate-600">
                  Día D · Municipales Villa Hayes · domingo 4 de octubre de 2026
                  {filtros.candidato && ` · ${filtros.candidato}`}
                </p>
              </div>
              <p className="text-xs text-slate-600">
                {lista.length} {lista.length === 1 ? "chofer" : "choferes"}
              </p>
            </header>

            <table>
              <thead>
                <tr>
                  <th style={{ width: "6%" }}>N.º orden</th>
                  <th style={{ width: "10%" }}>Cédula</th>
                  <th style={{ width: "22%" }}>Nombre completo</th>
                  {ctx.puedePII && <th style={{ width: "9%" }}>Teléfono</th>}
                  <th style={{ width: "8%" }}>Chapa</th>
                  <th style={{ width: "14%" }}>Candidato</th>
                  <th style={{ width: "12%" }}>Supervisor</th>
                  <th style={{ width: "5%" }}>Contr.</th>
                  <th style={{ width: "5%" }}>Vale</th>
                  <th style={{ width: "5%" }}>Antic.</th>
                  <th>Firma</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r, i) => (
                  <tr key={r.chofer_id}>
                    <td className="tabular-nums">{r.numero_orden ?? i + 1}</td>
                    <td>{ctx.puedePII ? formatearCI(r.ci) : ciParaExportar(ctx, r.ci)}</td>
                    <td>{r.nombre_completo}</td>
                    {ctx.puedePII && <td>{formatearTelefono(r.telefono_e164)}</td>}
                    <td>{r.chapa ?? ""}</td>
                    <td>{r.candidato ?? ""}</td>
                    <td>{r.supervisor ?? ""}</td>
                    <td>{SI_NO(r.contrato_firmado)}</td>
                    <td>{SI_NO(r.vale_entregado)}</td>
                    <td>{SI_NO(r.anticipo_pagado)}</td>
                    <td className="firma"></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className="mt-2 flex justify-between text-[7.5pt] text-slate-500">
              <span>{pie}</span>
              <span>Documento interno — contiene datos personales. No difundir.</span>
            </footer>
          </section>
        ))}

        {filas.length === 0 && (
          <p className="text-sm text-slate-600">
            La selección no devolvió ningún chofer.
          </p>
        )}
      </div>
    </>
  );
}
