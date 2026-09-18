"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getConfiguracion() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("organizaciones")
    .select("configuracion")
    .limit(1)
    .single();

  if (error) {
    console.error("Error fetching configuracion:", error);
    return {};
  }
  return data?.configuracion || {};
}

export async function saveConfiguracion(configJson: string) {
  try {
    const config = JSON.parse(configJson);
    const supabase = await crearClienteServidor();
    
    // Asumimos que la RLS update_organizacion validará el permiso de edición.
    // Actualmente, la organización actual del usuario se infiere, pero si
    // no hay una session directa con organization_id, podríamos necesitar
    // hacer una lectura del usuario activo. En el sistema actual, RLS 
    // usa auth.uid() para filtrar su organizacion.
    
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("No autenticado");

    // Encontramos la organización del usuario
    const { data: orgData } = await supabase
      .from("usuarios")
      .select("organizacion_id")
      .eq("id", userData.user.id)
      .single();

    if (!orgData?.organizacion_id) throw new Error("Organización no encontrada");

    const { error } = await supabase
      .from("organizaciones")
      .update({ configuracion: config })
      .eq("id", orgData.organizacion_id);

    if (error) {
      console.error("Error updating configuracion:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err: any) {
    console.error("Invalid JSON:", err);
    return { ok: false, error: err.message || "JSON Inválido o error desconocido" };
  }
}
