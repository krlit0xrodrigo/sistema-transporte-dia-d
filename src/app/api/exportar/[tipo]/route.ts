import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import * as xlsx from "xlsx";

// Memoria simple para rate limit (en producción usaría Redis)
const rateLimit = new Map<string, { count: number; start: number }>();

export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Rate Limiting (20 peticiones / 10 min)
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  let userRate = rateLimit.get(user.id) || { count: 0, start: now };

  if (now - userRate.start > windowMs) {
    userRate = { count: 0, start: now };
  }

  userRate.count++;
  rateLimit.set(user.id, userRate);

  if (userRate.count > 20) {
    return NextResponse.json({ error: "Rate limit excedido. Intente en 10 minutos." }, { status: 429 });
  }

  const { tipo } = await params;
  const searchParams = request.nextUrl.searchParams;
  const formato = searchParams.get("formato") || "csv"; // csv o xlsx

  let data: any[] | null = [];
  let cols: { header: string; key: string }[] = [];

  // Determinamos qué vista o query usar según el tipo
  switch (tipo) {
    case "padron":
      const { data: d1 } = await supabase.from("v_caja").select("*");
      data = d1;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Supervisor", key: "supervisor_nombre" },
        { header: "Candidato", key: "candidato" },
        { header: "Vehículo", key: "actividad" },
        { header: "Contrato", key: "contrato_firmado" },
      ];
      break;

    case "combustible":
      const { data: d2 } = await supabase.from("v_caja").select("*").eq("vale_entregado", true);
      data = d2;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Vehículo", key: "actividad" },
        { header: "Vale Entregado", key: "vale_entregado" },
      ];
      break;

    case "anticipos":
      const { data: d3 } = await supabase.from("v_caja").select("*").eq("anticipo_pagado", true);
      data = d3;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Anticipo", key: "anticipo_pagado" },
      ];
      break;
      
    case "pagos":
      const { data: d4 } = await supabase.from("v_caja").select("*").eq("pago_finalizado", true);
      data = d4;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Autorizado Por", key: "autorizado_por" },
        { header: "Pago Finalizado", key: "pago_finalizado" },
      ];
      break;

    case "lista_negra":
      const { data: d5 } = await supabase.from("v_lista_negra").select("*");
      data = d5;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Motivo", key: "motivo" },
        { header: "Fecha Alta", key: "fecha_alta" },
        { header: "Activo", key: "activo" },
      ];
      break;

    default:
      return NextResponse.json({ error: "Tipo de reporte desconocido" }, { status: 400 });
  }

  if (!data) data = [];

  // Mapear los datos según columnas
  const exportData = data.map(row => {
    const newRow: Record<string, any> = {};
    cols.forEach(col => {
      newRow[col.header] = row[col.key] !== null ? row[col.key] : "";
    });
    return newRow;
  });

  if (formato === "csv") {
    // Generar CSV
    if (exportData.length === 0) {
      return new NextResponse("Sin datos", {
        headers: { "Content-Type": "text/csv" }
      });
    }

    const headers = Object.keys(exportData[0]).join(",");
    const rows = exportData.map(row => 
      Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    return new NextResponse(`${headers}\n${rows}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reporte_${tipo}_${new Date().getTime()}.csv"`,
      },
    });

  } else if (formato === "xlsx") {
    // Generar XLSX
    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Reporte");
    
    // Configurar anchos de columna básicos
    ws['!cols'] = cols.map(() => ({ wch: 20 }));

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte_${tipo}_${new Date().getTime()}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
}
