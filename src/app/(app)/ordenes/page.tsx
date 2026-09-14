"use client";

import { useState, useTransition } from "react";
import { Boton, Card, CardHeader } from "@/components/ui";
import { PageHeader, Aviso } from "@/components/shared";
import { asignarOrdenesMasivo } from "./actions";
import { AlertTriangle, CheckCircle, Printer, Loader2 } from "lucide-react";
import Link from "next/link";

export default function OrdenesPage() {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string; asignados?: number } | null>(null);

  const handleAsignar = () => {
    startTransition(async () => {
      setResultado(null);
      const res = await asignarOrdenesMasivo();
      if (res.ok) {
        setResultado({ ok: true, msg: "Órdenes generadas exitosamente.", asignados: res.asignados });
      } else {
        setResultado({ ok: false, msg: res.error || "Ocurrió un error al asignar las órdenes." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Gestión de números de orden y emisión de planillas para firmas.">
        Órdenes de Trabajo y Planillas
      </PageHeader>

      {resultado && (
        <Aviso tono={resultado.ok ? "ok" : "error"}>
          <div className="flex items-start gap-2">
            {resultado.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              {resultado.msg}{" "}
              {resultado.asignados !== undefined && `Se asignaron ${resultado.asignados} nuevas órdenes.`}
            </span>
          </div>
        </Aviso>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader titulo="Asignación de Órdenes" />
          <div className="p-4 pt-0 space-y-4">
            <p className="text-sm text-slate-500">
              Genera los números de orden para los choferes que aún no tienen uno. 
              Los números de orden se asignan secuencialmente. Esto es necesario para poder imprimir las planillas.
            </p>
            <Boton onClick={handleAsignar} disabled={isPending} className="w-full sm:w-auto">
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Asignando...</>
              ) : (
                "Generar Órdenes Pendientes"
              )}
            </Boton>
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Impresión de Planillas" />
          <div className="p-4 pt-0 space-y-4">
            <p className="text-sm text-slate-500">
              Visualiza y genera los documentos en formato A4 listos para imprimir. Las planillas vienen 
              agrupadas automáticamente por candidato, supervisor y barrio para agilizar la logística.
            </p>
            <Link href="/ordenes/imprimir" passHref>
              <Boton tipo="secundario" className="w-full sm:w-auto">
                <Printer className="mr-2 h-4 w-4" /> Ver Planillas de Firma
              </Boton>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
