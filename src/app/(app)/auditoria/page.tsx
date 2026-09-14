import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Auditoría" };

export default function AuditoriaPage() {
  return (
    <div className="space-y-6">
      <PageHeader descripcion="Bitácora de cambios. Solo lectura, inmutable.">
        Auditoría
      </PageHeader>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">Módulo en construcción — FASE 10</p>
      </div>
    </div>
  );
}
