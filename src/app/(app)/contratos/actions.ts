"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarContrato(formData: FormData) {
  const supabase = await crearClienteServidor();
  const chofer_id = formData.get("chofer_id") as string;
  const monto = formData.get("monto") ? Number(formData.get("monto")) : null;

  if (!chofer_id) return { ok: false, error: "Falta ID de chofer" };

  const { data, error } = await supabase.rpc("fn_registrar_contrato", {
    p_chofer_id: chofer_id,
    p_monto: monto || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/contratos");
  return { ok: true, folio: data };
}
