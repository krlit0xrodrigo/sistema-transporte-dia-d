"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Acciones de caja y control.
 *
 * Son cáscaras finas sobre las funciones de PostgreSQL: toda la regla de
 * negocio —contrato antes que vale, actividad antes que pago, autorizador
 * distinto del pagador— vive en SQL. Acá sólo se traduce el error.
 */

const MENSAJES: Record<string, string> = {
  SIN_PERMISO: "Tu usuario no tiene permiso para esta acción.",
  SIN_CONTRATO: "No se puede avanzar sin el contrato firmado.",
  SIN_ACTIVIDAD: "El chofer no tiene actividad registrada. Hace falta una excepción aprobada.",
  SIN_AUTORIZACION: "El pago tiene que estar autorizado antes de marcarse.",
  MISMA_PERSONA: "Quien autorizó el pago no puede marcarlo como pagado.",
  EXCEPCION_INVALIDA: "La excepción no está aprobada o ya venció.",
  CHOFER_INEXISTENTE: "No se encontró el chofer.",
  PERSONA_INEXISTENTE: "Esa cédula no está en el sistema.",
  YA_EN_LISTA_NEGRA: "Esa persona ya tiene una entrada vigente en la lista negra.",
  MOTIVO_OBLIGATORIO: "Hace falta un motivo: sin él la acción no es auditable.",
  CI_OBLIGATORIO: "La cédula es obligatoria.",
  RANGO_INVALIDO: "El rango de folios no es válido.",
  RANGO_EXCESIVO: "El rango es demasiado grande (máximo 100.000 folios).",
  FOLIO_NO_ANULABLE: "Ese folio no existe o ya está usado por un documento.",
  NO_REVOCABLE: "Esa entrada no existe o ya estaba revocada.",
  SERIE_AGOTADA: "No quedan folios disponibles en la serie.",
};

function traducir(mensaje: string): string {
  for (const [codigo, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(codigo)) return texto;
  }
  return mensaje;
}

type Resultado = { ok: true } | { ok: false; error: string };

async function llamar(fn: string, args: Record<string, unknown>, ruta: string): Promise<Resultado> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: traducir(error.message) };
  revalidatePath(ruta);
  return { ok: true };
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? Number(s) : null;
};

// ---------------------------------------------------------------- caja
export async function firmarContrato(formData: FormData) {
  return llamar("fn_registrar_contrato", {
    p_chofer_id: String(formData.get("chofer_id")),
    p_monto: num(formData.get("monto")),
  }, "/caja");
}

export async function entregarVale(formData: FormData) {
  return llamar("fn_entregar_vale", {
    p_chofer_id: String(formData.get("chofer_id")),
    p_monto: num(formData.get("monto")),
    p_litros: num(formData.get("litros")),
  }, "/caja");
}

export async function pagarAnticipo(formData: FormData) {
  return llamar("fn_registrar_anticipo", {
    p_chofer_id: String(formData.get("chofer_id")),
    p_monto: num(formData.get("monto")),
  }, "/caja");
}

export async function autorizarPago(formData: FormData) {
  const chofer_id = String(formData.get("chofer_id"));
  let excepcion_id = String(formData.get("excepcion_id") ?? "") || null;
  
  if (!excepcion_id) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from('excepciones')
      .select('id')
      .eq('chofer_id', chofer_id)
      .eq('tipo', 'pago_sin_actividad')
      .eq('estado', 'aprobada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data) {
      excepcion_id = data.id;
    }
  }

  return llamar("fn_autorizar_pago_final", {
    p_chofer_id: chofer_id,
    p_excepcion_id: excepcion_id,
  }, "/caja");
}

export async function marcarPagoFinal(formData: FormData) {
  return llamar("fn_registrar_pago_final", {
    p_chofer_id: String(formData.get("chofer_id")),
    p_monto: num(formData.get("monto")),
  }, "/caja");
}

// ---------------------------------------------------------------- folios
export async function crearSerie(formData: FormData) {
  return llamar("fn_crear_serie_folios", {
    p_tipo: String(formData.get("tipo")),
    p_desde: Number(formData.get("desde")),
    p_hasta: Number(formData.get("hasta")),
    p_prefijo: String(formData.get("prefijo") ?? ""),
  }, "/folios");
}

export async function anularFolio(formData: FormData) {
  return llamar("fn_anular_folio", {
    p_folio_id: String(formData.get("folio_id")),
    p_motivo: String(formData.get("motivo") ?? ""),
  }, "/folios");
}

// ------------------------------------------------------------ lista negra
export async function agregarListaNegra(formData: FormData) {
  const vence = String(formData.get("vence_en") ?? "").trim();
  return llamar("fn_agregar_lista_negra", {
    p_ci: String(formData.get("ci")),
    p_motivo: String(formData.get("motivo")),
    p_detalle: String(formData.get("detalle") ?? "") || null,
    p_severidad: String(formData.get("severidad") ?? "bloqueo_total"),
    p_vence_en: vence ? new Date(vence).toISOString() : null,
    p_evidencia_url: String(formData.get("evidencia_url") ?? "") || null,
  }, "/lista-negra");
}

export async function revocarListaNegra(formData: FormData) {
  return llamar("fn_revocar_lista_negra", {
    p_id: String(formData.get("id")),
    p_motivo: String(formData.get("motivo") ?? ""),
  }, "/lista-negra");
}
