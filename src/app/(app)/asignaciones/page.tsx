import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Asignaciones" };

export default function AsignacionesPage() {
  return (
    <div className="space-y-6">
      <PageHeader descripcion="Asignación de choferes a candidatos, barrios y supervisores.">
        Asignaciones
      </PageHeader>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">Módulo en construcción — FASE 3</p>
      </div>
    </div>
  );
}
