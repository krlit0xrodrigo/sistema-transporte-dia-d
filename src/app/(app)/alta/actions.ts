"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { altaChoferSchema, traducirErrorServidor } from "@/lib/schemas/alta-chofer";
import { TraccarService } from "@/lib/services/traccar-service";

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
    aprobar_lista_negra: formData.get("aprobar_lista_negra") === "true",
    motivo_excepcion: String(formData.get("motivo_excepcion") ?? "").trim(),
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
      aprobar_lista_negra: d.aprobar_lista_negra,
      motivo_excepcion: d.motivo_excepcion || null,
    },
  });

  if (error) {
    return { ok: false, error: traducirErrorServidor(error.message) };
  }

  const resultado = data as { chofer_id: string };

  // Sincronizar con Traccar de forma no bloqueante (esperamos a que termine pero capturamos errores dentro del servicio)
  try {
    const [{ data: candidatoInfo }, { data: supervisorInfo }, { data: barrioInfo }] = await Promise.all([
      d.candidato_id ? supabase.from("candidatos").select("nombre_publico").eq("id", d.candidato_id).maybeSingle() : Promise.resolve({ data: null }),
      d.supervisor_id ? supabase.from("supervisores").select("alias").eq("id", d.supervisor_id).maybeSingle() : Promise.resolve({ data: null }),
      d.barrio_id ? supabase.from("barrios").select("nombre").eq("id", d.barrio_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    await TraccarService.syncChofer(
      { 
        ci: d.ci, 
        nombres: d.nombres, 
        apellidos: d.apellidos, 
        chapa: d.chapa,
        telefono: d.telefono,
        marca: d.marca,
        modelo: d.modelo,
        categoria: d.categoria
      },
      {
        candidatoNombre: candidatoInfo?.nombre_publico,
        supervisorNombre: supervisorInfo?.alias,
        barrioNombre: barrioInfo?.nombre,
      }
    );
  } catch (syncErr) {
    console.error("Error inesperado en sincronización de Traccar:", syncErr);
  }

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

export async function importarGoogleSheets(formData: FormData) {
  const supabase = await crearClienteServidor();
  const spreadsheetId = String(formData.get("spreadsheet_id") ?? "").trim();
  const sheetName = String(formData.get("sheet_name") ?? "").trim();

  if (!spreadsheetId) return { ok: false, error: "ID de Google Sheets es requerido" };

  const { readSheet } = await import("@/lib/sheets");
  
  let data;
  try {
    data = await readSheet(spreadsheetId, sheetName || 0);
  } catch (err: any) {
    return { ok: false, error: `Error leyendo Google Sheets: ${err.message}` };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "La hoja está vacía." };
  }

  const userRes = await supabase.auth.getUser();
  if (!userRes.data.user) return { ok: false, error: "No autorizado." };

  // Crear Lote
  const { data: eleccion } = await supabase.from("elecciones").select("id, organizacion_id").eq("estado", "activa").maybeSingle();
  if (!eleccion) return { ok: false, error: "No hay elección activa." };

  const { data: lote, error: errLote } = await supabase.from("importacion_lotes").insert({
    organizacion_id: eleccion.organizacion_id,
    eleccion_id: eleccion.id,
    creado_por: userRes.data.user.id,
    archivo_nombre: `Google Sheets: ${spreadsheetId}`,
    estado: "pendiente"
  }).select("id").single();

  if (errLote) return { ok: false, error: "Error al crear lote: " + errLote.message };

  // Insertar filas
  const filas = data.map((row, i) => ({
    lote_id: lote.id,
    fila_numero: i + 2,
    datos_crudos: row,
    estado: "pendiente"
  }));

  const { error: errFilas } = await supabase.from("importacion_filas").insert(filas);
  if (errFilas) return { ok: false, error: "Error insertando filas: " + errFilas.message };

  // Procesar lote (SQL)
  const { error: errProc } = await supabase.rpc("fn_procesar_lote_importacion", {
    p_lote_id: lote.id
  });

  if (errProc) return { ok: false, error: "Error procesando lote: " + errProc.message };

  return { ok: true, lote_id: lote.id, message: `Se importaron ${data.length} filas. Por favor revisa el panel para resolver posibles conflictos.` };
}

export async function consultarDatosChofer(ci: string) {
  const supabase = await crearClienteServidor();
  
  // 1. Verificar padrón
  const { data: padronData, error: padronError } = await supabase
    .rpc("fn_verificar_padron", { p_ci: ci });

  let padron = null;
  if (!padronError && padronData && padronData.length > 0) {
    padron = padronData[0];
  }

  // 2. Consultar antecedentes (histórico)
  const { data: antecedentesData, error: antecedentesError } = await supabase
    .from("v_antecedentes")
    .select("*")
    .eq("ci", ci)
    .order("eleccion_fecha", { ascending: false });
    
  return {
    ok: true,
    padron: padron?.encontrado ? padron : null,
    antecedentes: antecedentesError ? [] : (antecedentesData || []),
  };
}
