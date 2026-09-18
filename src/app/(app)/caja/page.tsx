import { crearClienteServidor } from "@/lib/supabase/server";
import { Vacio } from "@/components/ui";
import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";
import { CajaClient } from "./caja-client";
import {
  autorizarPago, entregarVale, firmarContrato, marcarPagoFinal, pagarAnticipo,
} from "@/lib/acciones";

export const metadata: Metadata = { title: "Caja" };

export default async function CajaPage() {
  const supabase = await crearClienteServidor();

  // Obtenemos la elección activa para no mezclar con choferes históricos
  const { data: eleccion } = await supabase
    .from("elecciones")
    .select("id")
    .eq("estado", "activa")
    .single();

  // Cargamos todos los registros de la vista v_caja (choferes activos).
  const { data, error } = await supabase
    .from("v_caja")
    .select("*")
    .eq("eleccion_id", eleccion?.id)
    .order("nombre_completo");

  const filas = (data ?? []) as any[];

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Panel de control unificado para seguimiento de contratos, vales de combustible, anticipos y pagos finales.">
        Caja y Pagos
      </PageHeader>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Error al cargar los datos de caja: {error.message}
        </div>
      )}

      {!error && (
        <CajaClient 
          filasIniciales={filas} 
          acciones={{
            firmarContrato,
            entregarVale,
            pagarAnticipo,
            marcarPagoFinal,
            autorizarPago
          }} 
        />
      )}

      <p className="text-xs text-slate-400">
        Los montos son opcionales (D-16). Mientras estén vacíos, el control es documental:
        quién firmó, quién cobró y con qué folio.
      </p>
    </div>
  );
}
