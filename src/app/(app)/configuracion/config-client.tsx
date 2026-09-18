"use client";

import { useState, useTransition } from "react";
import { saveConfiguracion } from "./actions";
import { Boton, Card } from "@/components/ui";
import { Loader2, Save, AlertTriangle, CheckCircle } from "lucide-react";
import { BloqueoAltaClient } from "./bloqueo-alta-client";
import { Aviso } from "@/components/shared";

export function ConfigClient({ initialConfig, esSuperAdmin, usuarios }: { initialConfig: any, esSuperAdmin: boolean, usuarios: any[] }) {
  const [configData, setConfigData] = useState<any>(initialConfig || {});
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialConfig || {}, null, 2));
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  // Cuando cambia el JSON manualmente
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    try {
      const parsed = JSON.parse(e.target.value);
      setConfigData(parsed);
    } catch (e) {
      // Ignorar errores mientras escribe
    }
  };

  // Cuando cambia la lista de bloqueados desde la UI visual
  const handleBloqueadosChange = (nuevosBloqueados: string[]) => {
    const newConfig = { ...configData, bloqueados_alta: nuevosBloqueados };
    setConfigData(newConfig);
    setJsonText(JSON.stringify(newConfig, null, 2));
    
    // Auto-guardar silenciosamente? No, que usen el botón de guardar global
    setResultado({ ok: true, msg: "Cambios registrados. No olvides presionar 'Guardar Cambios' al final." });
  };

  const handleSave = () => {
    startTransition(async () => {
      setResultado(null);
      const res = await saveConfiguracion(jsonText);
      if (res.ok) {
        setResultado({ ok: true, msg: "Configuración guardada exitosamente." });
      } else {
        setResultado({ ok: false, msg: res.error || "Error al guardar la configuración." });
      }
    });
  };

  const bloqueados_alta = configData.bloqueados_alta || [];

  return (
    <div className="space-y-6">
      {resultado && (
        <Aviso tono={resultado.ok ? "ok" : "error"}>
          <div className="flex items-start gap-2">
            {resultado.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{resultado.msg}</span>
          </div>
        </Aviso>
      )}

      {esSuperAdmin && usuarios && usuarios.length > 0 && (
        <BloqueoAltaClient 
          usuarios={usuarios} 
          bloqueados={bloqueados_alta} 
          onChange={handleBloqueadosChange} 
        />
      )}

      <Card className="p-4 space-y-4 bg-white">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Configuración Global (JSON)
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Ten cuidado al modificar estos parámetros, ya que afectan al comportamiento de todo el sistema.
            El formato debe ser un JSON válido.
          </p>
          <textarea
            value={jsonText}
            onChange={handleJsonChange}
            className="w-full h-64 font-mono text-sm p-4 border rounded-md bg-slate-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            spellCheck={false}
          />
        </div>

        <div className="flex justify-end">
          <Boton onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Guardar Cambios</>
            )}
          </Boton>
        </div>
      </Card>
    </div>
  );
}
