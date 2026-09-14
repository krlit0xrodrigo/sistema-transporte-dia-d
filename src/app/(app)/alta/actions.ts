"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { altaChoferSchema, traducirErrorServidor } from "@/lib/schemas/alta-chofer";

export interface AltaResult {
  ok: boolean;
  chofer_id?: string;
  error?: string;
}

/**
 * Server Action: dar de alta un chofer.
 *
 * La cadena completa de validaciones vive en fn_alta_chofer (una sola
 * transacción en la base): CI, padrón, lista negra, duplicado y cupo
 * en cascada. Replicarla acá sería tener dos fuentes de verdad.
 *
 * Este action valida el formulario con Zod y pasa todo al RPC.
 */
export async function altaChofer(formData: FormData): Promise<AltaResult> {
  const raw = {
    ci: String(formData.get("ci") ?? "").replace(/[^0-9]/g, "").replace(/^0+/, ""),
    nombres: String(formData.get("nombres") ?? "").trim(),
    apellidos: String(formData.get("apellidos") ?? "").trim(),
    telefono: String(formData.get("telefono") ?? "").trim(),
    candidato_id: String(formData.get("candidato_id") ?? "").trim(),
    barrio_id: String(formData.get("barrio_id") ?? "").trim(),
    supervisor_id: String(formData.get("supervisor_id") ?? "").trim(),
    estado_servicio: String(formData.get("estado_servicio") ?? "contratado"),
    chapa: String(formData.get("chapa") ?? "").trim(),
    categoria: String(formData.get("categoria") ?? ""),
    marca: String(formData.get("marca") ?? "").trim(),
    modelo: String(formData.get("modelo") ?? "").trim(),
  };

  const parsed = altaChoferSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Datos inválidos.";
    return { ok: false, error: firstError };
  }

  const d = parsed.data;
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc("fn_alta_chofer", {
    p: {
      ci: d.ci,
      nombres: d.nombres,
      apellidos: d.apellidos || null,
      telefono: d.telefono || null,
      candidato_id: d.candidato_id,
      barrio_id: d.barrio_id || null,
      supervisor_id: d.supervisor_id || null,
      responsable_supervisor_id: d.supervisor_id || null,
      responsable_candidato_id: d.supervisor_id ? null : d.candidato_id,
      estado_servicio: d.estado_servicio,
      chapa: d.chapa || null,
      categoria: d.categoria || null,
      marca: d.marca || null,
      modelo: d.modelo || null,
    },
  });

  if (error) {
    return { ok: false, error: traducirErrorServidor(error.message) };
  }

  const resultado = data as { chofer_id: string };
  redirect(`/choferes/${resultado.chofer_id}`);
}

export async function solicitarExcepcion(formData: FormData) {
  const supabase = await crearClienteServidor();
  const rawCi = String(formData.get("ci") ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
  const motivo = String(formData.get("motivo_excepcion") ?? "").trim();
  const tipo = String(formData.get("tipo_excepcion") ?? "lista_negra");

  if (!rawCi || !motivo) return { ok: false, error: "Datos incompletos para solicitar excepción." };

  const userRes = await supabase.auth.getUser();
  if (!userRes.data.user) return { ok: false, error: "No autorizado." };

  // Obtener eleccion_id y persona_id
  const { data: eleccion } = await supabase.from("elecciones").select("id, organizacion_id").eq("estado", "activa").maybeSingle();
  if (!eleccion) return { ok: false, error: "No hay elección activa." };

  let personaId = null;
  const { data: persona } = await supabase.from("personas").select("id").eq("ci", rawCi).maybeSingle();
  if (persona) personaId = persona.id;

  const { error } = await supabase.from("excepciones").insert({
    organizacion_id: eleccion.organizacion_id,
    eleccion_id: eleccion.id,
    persona_id: personaId,
    tipo: tipo as any,
    motivo: motivo,
    solicitado_por: userRes.data.user.id,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
