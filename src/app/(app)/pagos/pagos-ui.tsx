"use client";

import { useState, useTransition } from "react";
import { autorizarPago, pagarFinal } from "./actions";
import { PageHeader, Aviso } from "@/components/shared";
import { Boton, Card, CardHeader, Vacio, Input, Badge } from "@/components/ui";
import { formatearCI } from "@/lib/format";
import { Search, CreditCard, ShieldCheck, CheckCircle, AlertTriangle } from "lucide-react";

export function PagosUI({ choferes }: { choferes: any[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [pestaña, setPestaña] = useState<"autorizacion" | "caja">("caja");
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  // Autorización: tienen contrato, NO están autorizados
  const pendientesAutorizacion = choferes.filter(c => 
    c.contrato_firmado && !c.autorizado_por &&
    (c.ci.includes(busqueda) || c.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()))
  );

  // Caja: autorizados, NO pagados
  const pendientesPago = choferes.filter(c => 
    c.autorizado_por && !c.pago_finalizado &&
    (c.ci.includes(busqueda) || c.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const pagados = choferes.filter(c => c.pago_finalizado);

  const onAutorizar = (fd: FormData) => {
    startTransition(async () => {
      setResultado(null);
      const res = await autorizarPago(fd);
      if (res.ok) {
        setResultado({ ok: true, msg: "Pago autorizado correctamente." });
      } else {
        setResultado({ ok: false, msg: res.error || "Error al autorizar." });
      }
    });
  };

  const onPagar = (fd: FormData) => {
    startTransition(async () => {
      setResultado(null);
      const res = await pagarFinal(fd);
      if (res.ok) {
        setResultado({ ok: true, msg: `Pago final registrado exitosamente. (Folio: ${res.folio.numero})` });
      } else {
        setResultado({ ok: false, msg: res.error || "Error al registrar pago." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Doble control para el pago final: el supervisor/auditor autoriza, y el cajero ejecuta.">
        Pagos Finales
      </PageHeader>

      <div className="flex border-b border-slate-200">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${pestaña === "caja" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          onClick={() => setPestaña("caja")}
        >
          Ejecución en Caja
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${pestaña === "autorizacion" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          onClick={() => setPestaña("autorizacion")}
        >
          Autorización
        </button>
      </div>

      {resultado && (
        <Aviso tono={resultado.ok ? "ok" : "error"}>
          <div className="flex items-start gap-2">
            {resultado.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{resultado.msg}</span>
          </div>
        </Aviso>
      )}

      {pestaña === "autorizacion" && (
        <Card>
          <CardHeader titulo="Pendientes de Autorización" extra={<span className="text-xs text-slate-500">{pendientesAutorizacion.length}</span>} />
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
          {pendientesAutorizacion.length === 0 ? (
            <Vacio mensaje={busqueda ? "Nadie coincide con la búsqueda." : "No hay choferes pendientes de autorización."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cédula</th>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendientesAutorizacion.map((c) => (
                    <tr key={c.chofer_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatearCI(c.ci)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.nombre_completo}</td>
                      <td className="px-4 py-3">
                        <form action={onAutorizar}>
                          <input type="hidden" name="chofer_id" value={c.chofer_id} />
                          <Boton type="submit" disabled={isPending} tipo="secundario" className="h-8">
                            <ShieldCheck className="mr-2 h-4 w-4" /> Autorizar
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
      )}

      {pestaña === "caja" && (
        <Card>
          <CardHeader titulo="Pendientes de Pago (Autorizados)" extra={<span className="text-xs text-slate-500">{pendientesPago.length}</span>} />
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
          {pendientesPago.length === 0 ? (
            <Vacio mensaje={busqueda ? "Nadie coincide con la búsqueda." : "No hay choferes autorizados pendientes de cobro."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cédula</th>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendientesPago.map((c) => (
                    <tr key={c.chofer_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatearCI(c.ci)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.nombre_completo}</td>
                      <td className="px-4 py-3">
                        <form action={onPagar}>
                          <input type="hidden" name="chofer_id" value={c.chofer_id} />
                          <Boton type="submit" disabled={isPending} className="h-8">
                            <CreditCard className="mr-2 h-4 w-4" /> Pagar Final
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
      )}

      {pagados.length > 0 && !busqueda && (
        <Card className="opacity-70">
          <CardHeader titulo="Últimos pagos finales realizados" extra={<span className="text-xs text-slate-500">{pagados.length}</span>} />
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
