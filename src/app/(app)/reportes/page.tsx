"use client";

import { useState } from "react";
import { Aviso, PageHeader } from "@/components/shared";
import { Card, CardHeader, Boton } from "@/components/ui";
import { Download, FileText, FileSpreadsheet, Printer, CloudUpload } from "lucide-react";
import { exportarReporteSheets } from "./actions";

type TipoReporte = "padron" | "combustible" | "anticipos" | "pagos" | "lista_negra";

const REPORTES = [
  {
    id: "padron",
    titulo: "Padrón General de Choferes",
    descripcion: "Exportación completa de todos los choferes inscriptos y su estado actual.",
  },
  {
    id: "combustible",
    titulo: "Rendición de Combustible",
    descripcion: "Listado de choferes que recibieron vales de combustible, incluyendo el folio del vale.",
  },
  {
    id: "anticipos",
    titulo: "Rendición de Anticipos",
    descripcion: "Listado de choferes a los que se les entregó el anticipo en efectivo.",
  },
  {
    id: "pagos",
    titulo: "Rendición de Pagos Finales",
    descripcion: "Listado de choferes que cobraron su pago final, con la información de quién autorizó.",
  },
  {
    id: "lista_negra",
    titulo: "Historial de Lista Negra",
    descripcion: "Personas bloqueadas por antecedentes o conflictos (vigentes e inactivos).",
  }
] as const;

export default function ReportesPage() {
  const [descargando, setDescargando] = useState<string | null>(null);
  const [resultadoSheets, setResultadoSheets] = useState<{ repId: string, ok: boolean, msg: string } | null>(null);

  const handleDescarga = async (tipo: TipoReporte, formato: "csv" | "xlsx") => {
    setDescargando(`${tipo}-${formato}`);
    try {
      window.location.href = `/api/exportar/${tipo}?formato=${formato}`;
      // Simular un loader rápido
      setTimeout(() => setDescargando(null), 2000);
    } catch (error) {
      console.error(error);
      setDescargando(null);
    }
  };

  const handleImpresion = (tipo: TipoReporte) => {
    window.open(`/reportes/imprimir/${tipo}`, "_blank");
  };

  const handleExportarSheets = async (tipo: TipoReporte) => {
    const url = window.prompt("Ingrese el ID o la URL completa de la planilla de Google Sheets:");
    if (!url) return;

    setDescargando(`${tipo}-sheets`);
    setResultadoSheets(null);
    const res = await exportarReporteSheets(tipo, url);
    setDescargando(null);
    setResultadoSheets({ repId: tipo, ok: res.ok, msg: res.ok ? res.message : (res.error || "Error") });
  };

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Exportación de datos y rendiciones para fiscalización e inteligencia electoral.">
        Reportes y Exportaciones
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {REPORTES.map((rep) => (
          <Card key={rep.id} className="flex flex-col">
            <CardHeader titulo={rep.titulo} descripcion={rep.descripcion} />
            <div className="p-4 pt-0 mt-auto flex flex-col gap-2">
              <Boton
                tipo="secundario"
                className="w-full justify-start"
                onClick={() => handleDescarga(rep.id, "xlsx")}
                disabled={descargando === `${rep.id}-xlsx`}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" /> 
                {descargando === `${rep.id}-xlsx` ? "Generando..." : "Descargar Excel (.xlsx)"}
              </Boton>
              <Boton
                tipo="secundario"
                className="w-full justify-start"
                onClick={() => handleDescarga(rep.id, "csv")}
                disabled={descargando === `${rep.id}-csv`}
              >
                <FileText className="mr-2 h-4 w-4 text-blue-600" />
                {descargando === `${rep.id}-csv` ? "Generando..." : "Descargar Texto (.csv)"}
              </Boton>
              <Boton
                tipo="secundario"
                className="w-full justify-start"
                onClick={() => handleExportarSheets(rep.id as TipoReporte)}
                disabled={descargando === `${rep.id}-sheets`}
              >
                <CloudUpload className="mr-2 h-4 w-4 text-emerald-600" />
                {descargando === `${rep.id}-sheets` ? "Exportando..." : "Exportar a Google Sheets"}
              </Boton>
              <Boton
                tipo="secundario"
                className="w-full justify-start"
                onClick={() => handleImpresion(rep.id as TipoReporte)}
              >
                <Printer className="mr-2 h-4 w-4 text-slate-600" /> Imprimir (PDF)
              </Boton>
              {resultadoSheets?.repId === rep.id && (
                <div className="mt-2">
                  <Aviso tono={resultadoSheets.ok ? "ok" : "error"}>{resultadoSheets.msg}</Aviso>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
