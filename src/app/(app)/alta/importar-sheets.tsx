"use client";

import { useState, useTransition } from "react";
import { Boton, Input, Card, CardHeader, Aviso } from "@/components/ui";
import { importarGoogleSheets } from "./actions";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImportarSheets() {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string; lote_id?: string } | null>(null);
  const router = useRouter();

  const handleImportar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spreadsheetId) return;

    startTransition(async () => {
      setResultado(null);
      const formData = new FormData();
      formData.append("spreadsheet_id", spreadsheetId);
      if (sheetName) formData.append("sheet_name", sheetName);

      const res = await importarGoogleSheets(formData);
      if (res.ok) {
        setResultado({ ok: true, msg: res.message || "Importación exitosa", lote_id: res.lote_id });
        setTimeout(() => {
          router.push("/"); // Redirigir al dashboard para ver conflictos si los hay
        }, 3000);
      } else {
        setResultado({ ok: false, msg: res.error || "Ocurrió un error." });
      }
    });
  };

  return (
    <Card className="mt-8 border-dashed border-2">
      <CardHeader 
        titulo="Importar Choferes (Google Sheets)" 
        descripcion="Pega el ID o la URL completa de la planilla de Google Sheets. Asegúrate de haber compartido la planilla con la cuenta de servicio."
      />
      <div className="p-4 pt-0">
        <form onSubmit={handleImportar} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">URL o ID de la planilla *</label>
            <Input 
              placeholder="Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" 
              value={spreadsheetId}
              onChange={(e) => {
                // Si pega una URL, extraemos el ID
                let val = e.target.value;
                const match = val.match(/\/d\/(.*?)(\/|$)/);
                if (match && match[1]) {
                  val = match[1];
                }
                setSpreadsheetId(val);
              }}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre de la hoja (Opcional)</label>
            <Input 
              placeholder="Ej: Hoja 1 (Por defecto usa la primera)" 
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
            />
          </div>

          {resultado && (
            <Aviso tono={resultado.ok ? "ok" : "error"}>
              {resultado.msg}
            </Aviso>
          )}

          <Boton type="submit" disabled={isPending || !spreadsheetId} className="w-full">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            {isPending ? "Importando..." : "Iniciar Importación"}
          </Boton>
        </form>
      </div>
    </Card>
  );
}
