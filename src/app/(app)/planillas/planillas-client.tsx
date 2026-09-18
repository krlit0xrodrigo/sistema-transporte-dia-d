"use client";

import { useState, useTransition } from "react";
import { obtenerChoferesParaPlanilla } from "./actions";
import { Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type ChoferPlanilla = {
  id: string;
  nro_orden: number;
  ci: string;
  nombre_completo: string;
  supervisor: string | null;
  barrio: string | null;
};

export function PlanillasClient({ candidatos }: { candidatos: any[] }) {
  const [candidatoId, setCandidatoId] = useState<string>("");
  const [choferes, setChoferes] = useState<ChoferPlanilla[]>([]);
  const [isPending, startTransition] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);

  const candidatoSeleccionado = candidatos.find(c => c.id === candidatoId);

  const handleBuscar = () => {
    if (!candidatoId) return;
    
    startTransition(async () => {
      const res = await obtenerChoferesParaPlanilla(candidatoId);
      if (res.error) {
        alert(res.error);
      } else {
        setChoferes(res.choferes || []);
        setHasSearched(true);
      }
    });
  };

  const handleImprimir = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Zona de controles (no visible en impresión) */}
      <Card className="print:hidden">
        <CardContent className="pt-6 flex flex-col sm:flex-row items-end gap-4">
          <div className="space-y-2 flex-1 w-full max-w-sm">
            <Label>Seleccioná un Candidato</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={candidatoId}
              onChange={(e) => {
                setCandidatoId(e.target.value);
                setHasSearched(false);
                setChoferes([]);
              }}
            >
              <option value="">Elegí un candidato...</option>
              {candidatos.map(c => (
                <option key={c.id} value={c.id}>{c.nombre_publico}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleBuscar} disabled={!candidatoId || isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Cargar Planilla
          </Button>
          
          {hasSearched && choferes.length > 0 && (
            <Button onClick={handleImprimir} variant="outline" className="ml-auto">
              <Printer className="mr-2 h-4 w-4" /> Imprimir
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Mensaje de vacío (no visible en impresión si está vacío) */}
      {hasSearched && choferes.length === 0 && (
        <div className="p-8 text-center text-slate-500 print:hidden border border-dashed rounded-lg">
          No hay choferes nuevos con número de orden asignados a este candidato.
        </div>
      )}

      {/* Contenedor de la planilla física (visible en pantalla y en impresión) */}
      {choferes.length > 0 && (
        <div className="bg-white text-black p-0 print:p-0">
          
          {/* Cabecera de la Planilla */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-wider border-b-2 border-black pb-2 inline-block">
              Planilla de Control de Choferes
            </h1>
            <div className="mt-4 flex justify-between text-left border border-black p-4 bg-gray-50 print:bg-transparent">
              <div>
                <p><span className="font-bold">CANDIDATO RESPONSABLE:</span> {candidatoSeleccionado?.nombre_publico}</p>
                <p><span className="font-bold">TOTAL CHOFERES:</span> {choferes.length}</p>
              </div>
              <div className="text-right">
                <p><span className="font-bold">FECHA:</span> ____ / ____ / ________</p>
                <p><span className="font-bold">ENCARGADO:</span> ___________________</p>
              </div>
            </div>
          </div>

          {/* Tabla de Firmas */}
          <table className="w-full text-[11px] leading-tight border-collapse">
            <thead>
              <tr className="bg-gray-100 print:bg-transparent">
                <th className="border border-black p-2 text-center w-8">Nro</th>
                <th className="border border-black p-2 text-left w-48">Chofer</th>
                <th className="border border-black p-2 text-left w-24">C.I.</th>
                <th className="border border-black p-2 text-left w-32">Pertenece a</th>
                <th className="border border-black p-2 text-center w-24">Contrato Firmado</th>
                <th className="border border-black p-2 text-center w-24">Vale de Comb.</th>
                <th className="border border-black p-2 text-center w-24">Anticipo</th>
                <th className="border border-black p-2 text-center w-24">Pago Final</th>
              </tr>
            </thead>
            <tbody>
              {choferes.map((c) => (
                <tr key={c.id}>
                  <td className="border border-black p-2 text-center font-bold text-sm">{c.nro_orden}</td>
                  <td className="border border-black p-2 uppercase font-medium">{c.nombre_completo}</td>
                  <td className="border border-black p-2">{c.ci}</td>
                  <td className="border border-black p-2 text-[9px] uppercase">
                    {c.supervisor && <span className="block">Sup: {c.supervisor}</span>}
                    {c.barrio && <span className="block">Barrio: {c.barrio}</span>}
                    {!c.supervisor && !c.barrio && <span className="italic text-gray-500">Directo</span>}
                  </td>
                  <td className="border border-black p-4 text-center"></td>
                  <td className="border border-black p-4 text-center"></td>
                  <td className="border border-black p-4 text-center"></td>
                  <td className="border border-black p-4 text-center"></td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Estilos específicos para impresión integrados */}
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              @page { size: landscape; margin: 10mm; }
              body { background-color: white !important; }
              /* Ocultar barra lateral y menús de la aplicación entera */
              nav, aside, header, [data-sidebar="sidebar"] { display: none !important; }
              /* Expandir el contenido al 100% */
              main, #__next, .flex-1 { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
            }
          `}} />
        </div>
      )}
    </div>
  );
}
