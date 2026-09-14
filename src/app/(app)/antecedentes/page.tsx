import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Antecedentes" };

export default function AntecedentesPage() {
  return (
    <div className="space-y-6">
      <PageHeader descripcion="Historial de participaciones en elecciones anteriores. Solo lectura.">
        Antecedentes históricos
      </PageHeader>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">Módulo en construcción — FASE 4</p>
      </div>
    </div>
  );
}
