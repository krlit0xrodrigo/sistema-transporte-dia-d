"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function guardarMontosCaja(formData: FormData) {
  const supabase = await crearClienteServidor();

  const eleccionId = String(formData.get("eleccion_id"));
  const combustible = Number(formData.get("monto_combustible")) || 0;
  const anticipo = Number(formData.get("monto_anticipo")) || 0;
  const pagoFinal = Number(formData.get("monto_pago_final")) || 0;

  const { error } = await supabase.rpc("fn_guardar_montos_caja", {
    p_eleccion_id: eleccionId,
    p_monto_combustible: combustible,
    p_monto_anticipo: anticipo,
    p_monto_pago_final: pagoFinal,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/caja/montos");
  return { success: true };
}
