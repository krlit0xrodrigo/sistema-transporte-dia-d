"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function asignarOrdenesMasivo() {
  const supabase = await crearClienteServidor();
  const { data: eleccion } = await supabase
    .from("elecciones")
    .select("id")
    .eq("estado", "activa")
    .maybeSingle();

  if (!eleccion) {
    return { ok: false, error: "No hay elección activa." };
  }

  const { data, error } = await supabase.rpc("fn_asignar_orden_masivo", {
    p_eleccion_id: eleccion.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/ordenes");
  return { ok: true, asignados: data };
}
