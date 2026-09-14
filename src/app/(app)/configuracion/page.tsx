import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Configuración" };

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <PageHeader descripcion="Catálogos, elecciones y configuración del sistema.">
        Configuración
      </PageHeader>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">Módulo en construcción — FASE 10</p>
      </div>
    </div>
  );
}
