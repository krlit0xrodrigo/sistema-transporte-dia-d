"use client";

import { useState, useTransition } from "react";
import { registrarContrato } from "./actions";
import { PageHeader, Aviso } from "@/components/shared";
import { Boton, Card, CardHeader, Vacio, Input } from "@/components/ui";
import { Paginacion } from "@/components/ui/pagination";
import { formatearCI } from "@/lib/format";
import { Search, FileSignature, CheckCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const ITEMS_POR_PAGINA = 5;

export function ContratosUI({ choferes }: { choferes: any[] }) {
  const [busquedaPendientes, setBusquedaPendientes] = useState("");
  const [paginaPendientes, setPaginaPendientes] = useState(1);

  const [busquedaFirmados, setBusquedaFirmados] = useState("");
  const [paginaFirmados, setPaginaFirmados] = useState(1);

  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

  // Pendientes
  const filtradosPendientes = choferes.filter(c => 
    !c.contrato_firmado && 
    (c.ci.includes(busquedaPendientes) || c.nombre_completo.toLowerCase().includes(busquedaPendientes.toLowerCase()))
  );
  
  const totalPendientes = Math.max(1, Math.ceil(filtradosPendientes.length / ITEMS_POR_PAGINA));
  const paginadosPendientes = filtradosPendientes.slice(
    (paginaPendientes - 1) * ITEMS_POR_PAGINA,
    paginaPendientes * ITEMS_POR_PAGINA
  );

  // Firmados
  const filtradosFirmados = choferes.filter(c => 
    c.contrato_firmado && 
    (c.ci.includes(busquedaFirmados) || c.nombre_completo.toLowerCase().includes(busquedaFirmados.toLowerCase()))
  );

  const totalFirmados = Math.max(1, Math.ceil(filtradosFirmados.length / ITEMS_POR_PAGINA));
  const paginadosFirmados = filtradosFirmados.slice(
    (paginaFirmados - 1) * ITEMS_POR_PAGINA,
    paginaFirmados * ITEMS_POR_PAGINA
  );

  const onFirmar = (fd: FormData) => {
    startTransition(async () => {
      setResultado(null);
      const res = await registrarContrato(fd);
      if (res.ok) {
        setResultado({ ok: true, msg: `Contrato firmado exitosamente. (Folio: ${res.folio.numero})` });
      } else {
        setResultado({ ok: false, msg: res.error || "Ocurrió un error." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Primer paso de la cadena. Un chofer no puede recibir vales ni anticipos sin tener el contrato firmado.">
        Firma de Contratos
      </PageHeader>

      {resultado && (
        <Aviso tono={resultado.ok ? "ok" : "error"}>
          <div className="flex items-start gap-2">
            {resultado.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{resultado.msg}</span>
          </div>
        </Aviso>
      )}

      {/* PENDIENTES */}
      <Card>
        <CardHeader titulo="Choferes pendientes de firma" extra={<span className="text-xs text-slate-500">{filtradosPendientes.length}</span>} />
        
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por cédula o nombre..." 
              value={busquedaPendientes}
              onChange={(e) => {
                setBusquedaPendientes(e.target.value);
                setPaginaPendientes(1);
              }}
              className="pl-9 max-w-sm"
            />
          </div>
        </div>

        {filtradosPendientes.length === 0 ? (
          <Vacio mensaje={busquedaPendientes ? "No se encontraron choferes pendientes con esa búsqueda." : "No hay choferes pendientes de firma."} />
        ) : (
          <div>
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
                  {paginadosPendientes.map((c) => (
                    <tr key={c.chofer_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatearCI(c.ci)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.nombre_completo}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">{c.vehiculo || "Sin vehículo"}</td>
                      <td className="px-4 py-3">
                        <form action={onFirmar} className="flex items-center gap-2">
                          <input type="hidden" name="chofer_id" value={c.chofer_id} />
                          <Boton type="submit" disabled={isPending} className="whitespace-nowrap h-8">
                            <FileSignature className="mr-2 h-4 w-4" /> Firmar
                          </Boton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPendientes > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                <div className="text-sm text-slate-500">
                  Mostrando {(paginaPendientes - 1) * ITEMS_POR_PAGINA + 1} a {Math.min(paginaPendientes * ITEMS_POR_PAGINA, filtradosPendientes.length)} de {filtradosPendientes.length}
                </div>
                <Paginacion
                  currentPage={paginaPendientes}
                  totalPages={totalPendientes}
                  onPageChange={setPaginaPendientes}
                />
              </div>
            )}
          </div>
        )}
      </Card>
      
      {/* FIRMADOS */}
      <Card>
        <CardHeader titulo="Contratos Firmados" extra={<span className="text-xs text-slate-500">{filtradosFirmados.length}</span>} />
        
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por cédula o nombre..." 
              value={busquedaFirmados}
              onChange={(e) => {
                setBusquedaFirmados(e.target.value);
                setPaginaFirmados(1);
              }}
              className="pl-9 max-w-sm"
            />
          </div>
        </div>

        {filtradosFirmados.length === 0 ? (
          <Vacio mensaje={busquedaFirmados ? "No se encontraron choferes firmados con esa búsqueda." : "No hay choferes que hayan firmado contrato."} />
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cédula</th>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Vehículo</th>
                    <th className="px-4 py-2 font-medium">Fecha Firma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginadosFirmados.map((c) => (
                    <tr key={c.chofer_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 tabular-nums text-slate-600">{formatearCI(c.ci)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{c.nombre_completo}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">{c.vehiculo || "Sin vehículo"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.fecha_firma ? format(new Date(c.fecha_firma), "dd/MM/yyyy HH:mm") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalFirmados > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                <div className="text-sm text-slate-500">
                  Mostrando {(paginaFirmados - 1) * ITEMS_POR_PAGINA + 1} a {Math.min(paginaFirmados * ITEMS_POR_PAGINA, filtradosFirmados.length)} de {filtradosFirmados.length}
                </div>
                <Paginacion
                  currentPage={paginaFirmados}
                  totalPages={totalFirmados}
                  onPageChange={setPaginaFirmados}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
