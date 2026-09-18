import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";
import { getAuditLog, getAccesosSensibles } from "./actions";
import { AuditoriaClient } from "./auditoria-client";

export const metadata: Metadata = { title: "Auditoría" };

export default async function AuditoriaPage() {
  const [auditLog, accesos] = await Promise.all([
    getAuditLog(),
    getAccesosSensibles(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Bitácora de cambios y accesos sensibles. Solo lectura, inmutable.">
        Auditoría
      </PageHeader>
      
      <AuditoriaClient auditLog={auditLog} accesos={accesos} />
    </div>
  );
}
