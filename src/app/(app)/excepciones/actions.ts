"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function aprobarExcepcion(formData: FormData) {
  const supabase = await crearClienteServidor();
  const id = formData.get("id") as string;
  if (!id) return;

  const userRes = await supabase.auth.getUser();
  const uid = userRes.data.user?.id;

  const { error } = await supabase
    .from("excepciones")
    .update({ 
      estado: "aprobada", 
      aprobado_por: uid,
      aprobado_en: new Date().toISOString()
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/excepciones");
}

export async function rechazarExcepcion(formData: FormData) {
  const supabase = await crearClienteServidor();
  const id = formData.get("id") as string;
  if (!id) return;

  const { error } = await supabase
    .from("excepciones")
    .update({ estado: "rechazada" })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/excepciones");
}
