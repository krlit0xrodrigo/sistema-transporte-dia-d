"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function guardarMontosCaja(formData: FormData) {
  const supabase = await crearClienteServidor();

  const eleccionId = String(formData.get("eleccion_id"));

  const categorias = ["automovil", "camioneta", "minibus", "motocicleta"];
  const tarifas_vehiculos: Record<string, any> = {};

  for (const cat of categorias) {
    tarifas_vehiculos[cat] = {
      combustible: Number(formData.get(`${cat}_combustible`)) || 0,
      anticipo: Number(formData.get(`${cat}_anticipo`)) || 0,
      pago_final: Number(formData.get(`${cat}_pago_final`)) || 0,
    };
  }

  const { error } = await supabase.rpc("fn_guardar_montos_caja", {
    p_eleccion_id: eleccionId,
    p_tarifas_vehiculos: tarifas_vehiculos,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/caja/montos");
  return { success: true };
}
