"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function editarAsignacion(
  chofer_id: string,
  data: {
    candidato_id: string;
    supervisor_id: string | null;
    barrio_id: string | null;
    estado_servicio: "contratado" | "voluntario" | "pendiente";
  }
) {
  const supabase = await crearClienteServidor();

  const { error } = await supabase.rpc("fn_editar_asignacion_chofer", {
    p: {
      chofer_id,
      ...data,
    },
  });

  if (error) {
    console.error("Error al editar asignación:", error);
    // Extraer el mensaje amigable si es de CUPO_AGOTADO u otro error personalizado
    let errorMessage = error.message;
    if (errorMessage.includes("CUPO_AGOTADO")) {
      errorMessage = "No hay cupos disponibles en el candidato, supervisor o barrio seleccionado.";
    }
    return { ok: false, error: errorMessage };
  }

  revalidatePath(`/choferes/${chofer_id}`);
  return { ok: true };
}
