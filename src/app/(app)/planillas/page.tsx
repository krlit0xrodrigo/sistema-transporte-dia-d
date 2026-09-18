import { Suspense } from "react";
import { PlanillasClient } from "./planillas-client";
import { obtenerCandidatosActivos } from "./actions";

export const metadata = {
  title: "Planillas de Firma | Día D",
};

export default async function PlanillasPage() {
  const { candidatos, error } = await obtenerCandidatosActivos();

  if (error) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Planillas de Firma</h2>
            <p className="text-sm text-slate-500">
              Generá la planilla física por candidato para la recolección de firmas.
            </p>
          </div>
        </div>
        
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando módulo...</div>}>
          <PlanillasClient candidatos={candidatos || []} />
        </Suspense>
      </div>
    </div>
  );
}
