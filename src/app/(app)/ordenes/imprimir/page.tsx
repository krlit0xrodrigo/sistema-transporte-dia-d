import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearCI } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Planillas de Firma" };

export default async function PlanillasImpresionPage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("v_planillas_impresion").select("*");
  const filas = (data ?? []) as any[];

  if (error) {
    return <div className="p-8 text-rose-600">Error al cargar las planillas: {error.message}</div>;
  }

  // Agrupar filas
  // Agrupación: Candidato > Supervisor > Barrio
  const agrupado: Record<string, Record<string, Record<string, any[]>>> = {};

  for (const fila of filas) {
    const cand = fila.candidato_nombre || "Sin Candidato";
    const sup = fila.supervisor_nombre || "Sin Supervisor";
    const barrio = fila.barrio_nombre || "Sin Barrio";

    if (!agrupado[cand]) agrupado[cand] = {};
    if (!agrupado[cand][sup]) agrupado[cand][sup] = {};
    if (!agrupado[cand][sup][barrio]) agrupado[cand][sup][barrio] = [];

    agrupado[cand][sup][barrio].push(fila);
  }

  return (
    <div className="min-h-screen bg-slate-100 p-8 print:bg-white print:p-0 font-sans">
      <div className="mb-4 print:hidden flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <div>
          <h1 className="text-xl font-bold">Planillas de Firma</h1>
          <p className="text-sm text-slate-500">Usa Ctrl+P (o Cmd+P) para imprimir o guardar como PDF.</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm transition-colors"
        >
          Imprimir Planillas
        </button>
      </div>

      {Object.entries(agrupado).map(([cand, sups]) => (
        Object.entries(sups).map(([sup, barrios]) => (
          Object.entries(barrios).map(([barrio, choferes]) => (
            <div key={`${cand}-${sup}-${barrio}`} className="bg-white p-8 mb-8 shadow-sm print:shadow-none print:m-0 print:p-0 break-before-page first:break-before-auto">
              {/* Encabezado */}
              <div className="flex justify-between items-end border-b-2 border-slate-900 pb-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Planilla de Control y Firma</h2>
                  <p className="text-sm text-slate-600 mt-1 font-medium">Elección: Día D - Transporte</p>
                </div>
                <div className="text-right text-sm">
                  <p><span className="font-semibold uppercase text-xs tracking-wider text-slate-500">Candidato</span> <br /><span className="text-base font-bold">{cand}</span></p>
                </div>
              </div>

              <div className="flex justify-between mb-6 text-sm">
                <div>
                  <span className="font-semibold uppercase text-xs tracking-wider text-slate-500">Supervisor Responsable</span>
                  <p className="text-lg font-bold">{sup}</p>
                </div>
                <div className="text-right">
                  <span className="font-semibold uppercase text-xs tracking-wider text-slate-500">Barrio de Asignación</span>
                  <p className="text-lg font-bold">{barrio}</p>
                </div>
              </div>

              {/* Tabla */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-800">
                    <th className="py-2 px-2 text-left w-16">N° Orden</th>
                    <th className="py-2 px-2 text-left">Cédula</th>
                    <th className="py-2 px-2 text-left">Nombre Completo</th>
                    <th className="py-2 px-2 text-left">Teléfono</th>
                    <th className="py-2 px-2 text-left">Vehículo</th>
                    <th className="py-2 px-2 text-center w-32">Firma del Chofer</th>
                  </tr>
                </thead>
                <tbody>
                  {choferes.map((c) => (
                    <tr key={c.chofer_id} className="border-b border-slate-300">
                      <td className="py-3 px-2 font-bold text-base text-slate-900 tabular-nums">{c.numero_orden}</td>
                      <td className="py-3 px-2 font-medium tabular-nums">{formatearCI(c.ci)}</td>
                      <td className="py-3 px-2 uppercase text-xs font-bold">{c.nombre}</td>
                      <td className="py-3 px-2 tabular-nums">{c.telefono || "-"}</td>
                      <td className="py-3 px-2 text-xs">
                        {c.chapa ? (
                          <>
                            <span className="font-bold border border-slate-300 px-1 rounded mr-1 bg-slate-50">{c.chapa}</span>
                            <span className="text-slate-500">{c.marca} {c.modelo}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 italic">No especificado</span>
                        )}
                      </td>
                      <td className="py-3 px-2"></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-12 pt-4 flex justify-between text-xs text-slate-500">
                <p>Generado por el Sistema de Transporte - Día D</p>
                <p>Página de control (Impreso)</p>
              </div>
            </div>
          ))
        ))
      ))}
    </div>
  );
}
