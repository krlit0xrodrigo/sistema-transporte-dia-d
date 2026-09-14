"use client";

import { useState, useTransition } from "react";
import { pagarAnticipo } from "./actions";
import { PageHeader, Aviso } from "@/components/shared";
import { Boton, Card, CardHeader, Vacio, Input, Badge } from "@/components/ui";
import { formatearCI } from "@/lib/format";
import { Search, Banknote, CheckCircle, AlertTriangle } from "lucide-react";

export function AnticiposUI({ choferes }: { choferes: any[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  // Mostrar los que firmaron contrato pero aún no cobraron el anticipo
  const filtrados = choferes.filter(c => 
    c.contrato_firmado && !c.anticipo_pagado && 
    (c.ci.includes(busqueda) || c.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const pagados = choferes.filter(c => c.anticipo_pagado);

  const onPagar = (fd: FormData) => {
    startTransition(async () => {
      setResultado(null);
      const res = await pagarAnticipo(fd);
      if (res.ok) {
        setResultado({ ok: true, msg: `Anticipo pagado exitosamente. (Folio: ${res.folio.numero})` });
      } else {
        setResultado({ ok: false, msg: res.error || "Ocurrió un error." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Pago de anticipos en efectivo. Requiere contrato firmado previamente.">
        Anticipos
      </PageHeader>

      {resultado && (
        <Aviso tono={resultado.ok ? "ok" : "error"}>
          <div className="flex items-start gap-2">
            {resultado.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{resultado.msg}</span>
          </div>
        </Aviso>
      )}

      <Card>
        <CardHeader titulo="Choferes habilitados para anticipo" extra={<span className="text-xs text-slate-500">{filtrados.length}</span>} />
        
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por cédula o nombre..." 
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <Vacio mensaje={busqueda ? "Nadie coincide con la búsqueda o falta firmar contrato." : "No hay choferes habilitados para cobrar anticipo."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Cédula</th>
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Vehículo</th>
                  <th className="px-4 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((c) => (
                  <tr key={c.chofer_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatearCI(c.ci)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.nombre_completo}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 capitalize">{c.actividad}</td>
                    <td className="px-4 py-3">
                      <form action={onPagar} className="flex items-center gap-2">
                        <input type="hidden" name="chofer_id" value={c.chofer_id} />
                        <Boton type="submit" disabled={isPending} className="whitespace-nowrap h-8">
                          <Banknote className="mr-2 h-4 w-4" /> Pagar Anticipo
                        </Boton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pagados.length > 0 && !busqueda && (
        <Card className="opacity-70">
          <CardHeader titulo="Últimos anticipos pagados" extra={<span className="text-xs text-slate-500">{pagados.length}</span>} />
          <div className="p-4 flex gap-2 flex-wrap">
            {pagados.slice(0, 20).map(c => (
              <Badge key={c.chofer_id} tono="ok">
                {formatearCI(c.ci)}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
