"use server";

import { crearClienteServidor } from "@/lib/supabase/server";
import { writeSheet } from "@/lib/sheets";

export async function exportarReporteSheets(tipo: string, spreadsheetIdInput: string) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autorizado." };

  let spreadsheetId = spreadsheetIdInput;
  const match = spreadsheetId.match(/\/d\/(.*?)(\/|$)/);
  if (match && match[1]) {
    spreadsheetId = match[1];
  }

  if (!spreadsheetId) return { ok: false, error: "ID de planilla inválido." };

  let data: any[] | null = [];
  
  switch (tipo) {
    case "padron":
      const { data: d1 } = await supabase.from("v_caja").select("*");
      data = d1;
      break;
    case "combustible":
      const { data: d2 } = await supabase.from("v_caja").select("*").eq("vale_entregado", true);
      data = d2;
      break;
    case "anticipos":
      const { data: d3 } = await supabase.from("v_caja").select("*").eq("anticipo_pagado", true);
      data = d3;
      break;
    case "pagos":
      const { data: d4 } = await supabase.from("v_caja").select("*").eq("pago_finalizado", true);
      data = d4;
      break;
    case "lista_negra":
      const { data: d5 } = await supabase.from("v_lista_negra").select("*");
      data = d5;
      break;
    default:
      return { ok: false, error: "Tipo desconocido." };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "No hay datos para exportar." };
  }

  // Quitar objetos anidados y convertir todo a string plano
  const exportData = data.map(row => {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      flat[k] = v !== null ? String(v) : "";
    }
    return flat;
  });

  try {
    await writeSheet(spreadsheetId, `Reporte ${tipo.toUpperCase()}`, exportData);
    return { ok: true, message: `Reporte exportado exitosamente a la hoja "Reporte ${tipo.toUpperCase()}".` };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}
