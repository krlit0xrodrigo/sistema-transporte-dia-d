import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Combustible" };

export default function CombustiblePage() {
  return (
    <div className="space-y-6">
      <PageHeader descripcion="Vales de combustible con folio, fecha y responsable.">
        Combustible
      </PageHeader>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">Módulo en construcción — FASE 6</p>
      </div>
    </div>
  );
}
