"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function guardarCandidato(formData: FormData) {
  const s = await crearClienteServidor();
  const eleccionId = String(formData.get("eleccion_id"));
  const candidatoId = formData.get("candidato_id") ? String(formData.get("candidato_id")) : null;
  const nombre = String(formData.get("nombre"));
  const cupo = Number(formData.get("cupo"));

  const { error } = await s.rpc("fn_guardar_candidato", {
    p_eleccion_id: eleccionId,
    p_nombre: nombre,
    p_cupo: cupo,
    p_candidato_id: candidatoId
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/estructura");
  return { success: true };
}

export async function guardarSupervisor(formData: FormData) {
  const s = await crearClienteServidor();
  const eleccionId = String(formData.get("eleccion_id"));
  const supervisorId = formData.get("supervisor_id") ? String(formData.get("supervisor_id")) : null;
  const candidatoId = String(formData.get("candidato_id"));
  const alias = String(formData.get("alias"));
  const cupo = Number(formData.get("cupo"));

  const { error } = await s.rpc("fn_guardar_supervisor", {
    p_eleccion_id: eleccionId,
    p_candidato_id: candidatoId,
    p_alias: alias,
    p_cupo: cupo,
    p_supervisor_id: supervisorId
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/estructura");
  return { success: true };
}

export async function guardarBarrio(formData: FormData) {
  const s = await crearClienteServidor();
  const eleccionId = String(formData.get("eleccion_id"));
  const barrioId = formData.get("barrio_id") ? String(formData.get("barrio_id")) : null;
  const nombre = String(formData.get("nombre"));
  const cupo = Number(formData.get("cupo"));

  const { error } = await s.rpc("fn_guardar_barrio", {
    p_eleccion_id: eleccionId,
    p_nombre: nombre,
    p_cupo: cupo,
    p_barrio_id: barrioId
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/estructura");
  return { success: true };
}
