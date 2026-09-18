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

  const { data: eleccion } = await supabase.from("elecciones").select("id").eq("estado", "activa").maybeSingle();
  const eleccionId = eleccion?.id || "";

  // Determinamos qué vista o query usar según el tipo
  switch (tipo) {
    case "padron":
      const { data: d1 } = await supabase
        .from("v_choferes_ficha")
        .select("*")
        .eq("eleccion_id", eleccionId)
        .is("origen_planilla_id", null);
      data = d1;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Candidato", key: "candidato" },
        { header: "Barrio", key: "barrio" },
        { header: "Teléfono", key: "telefono_e164" },
        { header: "Supervisor", key: "supervisor" },
        { header: "Padrón", key: "estado_identidad" },
      ];
      break;

    case "combustible":
      const { data: d2 } = await supabase.from("v_caja").select("*").eq("eleccion_id", eleccionId).eq("vale_entregado", true);
      data = d2;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Vehículo", key: "actividad" },
        { header: "Vale Entregado", key: "vale_entregado" },
      ];
      break;

    case "anticipos":
      const { data: d3 } = await supabase.from("v_caja").select("*").eq("eleccion_id", eleccionId).eq("anticipo_pagado", true);
      data = d3;
      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Anticipo", key: "anticipo_pagado" },
      ];
      break;
      
    case "pagos":
      const { data: choferesBruto } = await supabase
        .from("choferes")
        .select(`
          id,
          personas!inner(ci, nombre_completo, telefono_e164, estado_identidad),
          chofer_vehiculos(hasta, vehiculos(chapa, categoria, marca, modelo)),
          asignaciones(vigente_hasta, candidatos(nombre_publico), barrios(nombre), supervisores(alias)),
          contratos(estado, firmado),
          vales_combustible(estado, entregado),
          anticipos(estado, pagado),
          pagos_finales(estado, finalizado),
          dispositivos_gps(estado)
        `)
        .eq("eleccion_id", eleccionId)
        .is("origen_planilla_id", null)
        .eq("estado", "activo");

      data = (choferesBruto || []).map((row: any) => {
        // Encontrar los registros vigentes
        const cv = (row.chofer_vehiculos || []).find((x: any) => !x.hasta)?.vehiculos || {};
        const asig = (row.asignaciones || []).find((x: any) => !x.vigente_hasta) || {};
        const contrato = (row.contratos || []).find((x: any) => x.estado !== 'anulado') || {};
        const vale = (row.vales_combustible || []).find((x: any) => x.estado !== 'anulado') || {};
        const ant = (row.anticipos || []).find((x: any) => x.estado !== 'anulado') || {};
        const pago = (row.pagos_finales || []).find((x: any) => x.estado !== 'anulado') || {};
        const gps = (row.dispositivos_gps || [])[0] || {};

        return {
          ci: row.personas?.ci,
          nombre_completo: row.personas?.nombre_completo,
          candidato: asig.candidatos?.nombre_publico || "",
          barrio: asig.barrios?.nombre || "",
          telefono: row.personas?.telefono_e164 || "",
          supervisor: asig.supervisores?.alias || "",
          padron: row.personas?.estado_identidad === "verificada" ? "Verificada" 
                : row.personas?.estado_identidad === "fuera_de_padron" ? "Fuera de Padrón" 
                : "Discrepancia",
          chapa: cv.chapa || "",
          marca: cv.marca || "",
          modelo: cv.modelo || "",
          tipo_vehiculo: cv.categoria || "",
          contrato_firmado: contrato.firmado ? "Sí" : "No",
          vale_combustible: vale.entregado ? "Sí" : "No",
          anticipo: ant.pagado ? "Sí" : "No",
          pago_final: pago.finalizado ? "Sí" : "No",
          gps_vinculado: gps.estado === 'activo' ? "Sí" : "No"
        };
      });

      cols = [
        { header: "Cédula", key: "ci" },
        { header: "Nombre Completo", key: "nombre_completo" },
        { header: "Candidato", key: "candidato" },
        { header: "Barrio", key: "barrio" },
        { header: "Teléfono", key: "telefono" },
        { header: "Supervisor", key: "supervisor" },
        { header: "Padrón", key: "padron" },
        { header: "Chapa", key: "chapa" },
        { header: "Marca", key: "marca" },
        { header: "Modelo", key: "modelo" },
        { header: "Tipo de Vehículo", key: "tipo_vehiculo" },
        { header: "Contrato Firmado", key: "contrato_firmado" },
        { header: "Vale de Combustible", key: "vale_combustible" },
        { header: "Anticipo", key: "anticipo" },
        { header: "Pago Final", key: "pago_final" },
        { header: "Vinculado al GPS", key: "gps_vinculado" }
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
