import { crearClienteServidor } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";
import { MontosClient } from "./montos-client";

export const metadata: Metadata = { title: "Montos de Caja" };

export default async function MontosPage() {
  const supabase = await crearClienteServidor();

  // Obtenemos la elección activa y sus montos configurados
  const { data: eleccion, error: eleccionError } = await supabase
    .from("elecciones")
    .select("id, monto_combustible, monto_anticipo, monto_pago_final")
    .eq("estado", "activa")
    .single();

  if (eleccionError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <p className="font-semibold mb-1">Error de base de datos:</p>
        <p>{eleccionError.message}</p>
        {eleccionError.code === "42703" && (
          <p className="mt-2 font-medium">⚠️ ¡Falta correr la migración SQL! Asegurate de ejecutar el archivo 20260918001600_elecciones_montos_caja.sql en tu Supabase.</p>
        )}
      </div>
    );
  }

  if (!eleccion) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No hay ninguna elección activa configurada.
      </div>
    );
  }

  // Cargamos los registros de la vista v_caja para la elección activa
  const { data, error } = await supabase
    .from("v_caja")
    .select("candidato, supervisor, barrio, vale_entregado, anticipo_pagado, pago_finalizado")
    .eq("eleccion_id", eleccion.id);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Error al cargar los datos de caja: {error.message}
      </div>
    );
  }

  const filas = (data ?? []) as any[];

  // Cálculos
  const totalChoferes = filas.length;
  
  const entregadosCombustible = filas.filter(f => f.vale_entregado).length;
  const pagadosAnticipo = filas.filter(f => f.anticipo_pagado).length;
  const finalizadosPago = filas.filter(f => f.pago_finalizado).length;

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Configuración global de montos y panel de control financiero para la elección activa.">
        Control de Montos
      </PageHeader>

      <MontosClient
        eleccionId={eleccion.id}
        montos={{
          combustible: eleccion.monto_combustible ?? 0,
          anticipo: eleccion.monto_anticipo ?? 0,
          pagoFinal: eleccion.monto_pago_final ?? 0,
        }}
        contadores={{
          totalChoferes,
          entregadosCombustible,
          pagadosAnticipo,
          finalizadosPago
        }}
        choferes={filas}
      />
    </div>
  );
}
