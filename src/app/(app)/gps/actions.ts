"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function vincularGPS(choferId: string, traccarDeviceId: string, uniqueId: string) {
  const supabase = await crearClienteServidor();
  const { data: hasPerm } = await supabase.rpc('auth_tiene_permiso', { p_codigo: 'gps.gestionar_dispositivos' });
  
  if (!hasPerm) {
    return { error: "Tu usuario no tiene permiso para gestionar dispositivos." };
  }

  const sAdmin = await import("@/lib/supabase/server").then(m => m.crearClienteAdmin());

  // Obtener datos del chofer (usamos admin porque consulta podría no tener acceso al RLS del chofer)
  const { data: chofer } = await sAdmin
    .from("choferes")
    .select("id, eleccion_id, organizacion_id")
    .eq("id", choferId)
    .maybeSingle();

  if (!chofer) {
    return { error: "El chofer no existe o no está activo." };
  }

  // Desactivar cualquier dispositivo previo que tenga el chofer
  await sAdmin
    .from("dispositivos_gps")
    .update({ estado: "baja", baja_en: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("chofer_id", choferId)
    .neq("estado", "baja");

  const { error } = await sAdmin.from("dispositivos_gps").insert({
    organizacion_id: chofer.organizacion_id,
    eleccion_id: chofer.eleccion_id,
    chofer_id: chofer.id,
    traccar_device_id: traccarDeviceId ? Number(traccarDeviceId) : null,
    unique_id: uniqueId || null,
    estado: "activo",
    alta_en: new Date().toISOString(),
  });

  if (error) {
    const m = error.message;
    if (m.includes("ux_disp_chofer")) return { error: "Ese chofer ya tiene un dispositivo vinculado." };
    if (m.includes("ux_disp_traccar")) return { error: "Ese ID de Traccar ya está vinculado a otro chofer." };
    if (m.includes("ux_disp_unique")) return { error: "Ese identificador de equipo ya está en uso." };
    if (m.includes("row-level security")) {
      return { error: "Tu usuario no tiene permiso para gestionar dispositivos." };
    }
    return { error: m };
  }

  revalidatePath("/gps");
  return { ok: true };
}

export async function darDeBajaGPS(dispositivoId: string) {
  const supabase = await crearClienteServidor();
  const { data: hasPerm } = await supabase.rpc('auth_tiene_permiso', { p_codigo: 'gps.gestionar_dispositivos' });
  
  if (!hasPerm) {
    return { error: "Tu usuario no tiene permiso para gestionar dispositivos." };
  }

  const sAdmin = await import("@/lib/supabase/server").then(m => m.crearClienteAdmin());

  const { error } = await sAdmin
    .from("dispositivos_gps")
    .update({ estado: "baja", baja_en: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", dispositivoId);
    
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/gps");
  return { ok: true };
}
