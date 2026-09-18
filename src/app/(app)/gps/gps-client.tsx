"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Paginacion } from "@/components/ui/pagination";
import { formatearCI } from "@/lib/format";
import { vincularGPS, darDeBajaGPS } from "./actions";
import { Loader2 } from "lucide-react";

type ChoferGps = {
  id: string;
  ci: string;
  nombre_completo: string;
  telefono: string | null;
  candidato: string | null;
  supervisor: string | null;
  barrio: string | null;
  dispositivo: {
    id: string;
    traccar_device_id: number | null;
    unique_id: string | null;
    estado: string;
    ultimo_contacto: string | null;
  } | null;
};

export function GpsClient({ choferes }: { choferes: ChoferGps[] }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferGps | null>(null);
  const [busqueda, setBusqueda] = useState("");
  
  const vinculados = choferes.filter(c => c.dispositivo).length;
  const pendientes = choferes.length - vinculados;

  const abrirVincular = (c: ChoferGps) => {
    setChoferSeleccionado(c);
    setModalAbierto(true);
  };

  const filtrados = choferes.filter(c => {
    if (!busqueda) return true;
    const term = busqueda.toLowerCase();
    return (
      c.nombre_completo.toLowerCase().includes(term) ||
      c.ci.includes(term) ||
      (c.candidato || "").toLowerCase().includes(term) ||
      (c.supervisor || "").toLowerCase().includes(term) ||
      (c.barrio || "").toLowerCase().includes(term)
    );
  });

  const [paginaActual, setPaginaActual] = useState(1);
  const limite = 50;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / limite));

  // Resetear a página 1 si la búsqueda cambia y deja la página actual fuera de rango
  if (paginaActual > totalPages && totalPages > 0) {
    setPaginaActual(1);
  }

  const offset = (paginaActual - 1) * limite;
  const paginaFiltrados = filtrados.slice(offset, offset + limite);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums">{choferes.length}</p>
          <p className="text-sm text-slate-600">Total Choferes</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums text-emerald-600">{vinculados}</p>
          <p className="text-sm text-slate-600">Con dispositivo activo</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums text-rose-600">{pendientes}</p>
          <p className="text-sm text-slate-600">Pendientes de vínculo</p>
        </Card>
      </div>

      <div className="mb-4">
        <input 
          type="text"
          placeholder="Buscar por cédula, nombre, candidato, barrio..."
          className="w-full max-w-md rounded-md border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPaginaActual(1);
          }}
        />
      </div>

      <Card>
        <CardHeader titulo="Estado de GPS por Chofer" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Cédula</th>
                <th className="px-4 py-2 font-medium">Chofer</th>
                <th className="px-4 py-2 font-medium">Estructura</th>
                <th className="px-4 py-2 font-medium">Traccar ID / Equipo</th>
                <th className="px-4 py-2 font-medium">Estado GPS</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginaFiltrados.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 tabular-nums font-medium">{formatearCI(c.ci)}</td>
                  <td className="px-4 py-2">
                    <div className="font-semibold">{c.nombre_completo}</div>
                    <div className="text-xs text-slate-500">{c.telefono || "Sin teléfono"}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {c.candidato && <div>Cand: <span className="font-medium text-slate-800">{c.candidato}</span></div>}
                    {c.supervisor && <div>Sup: <span className="font-medium text-slate-800">{c.supervisor}</span></div>}
                    {c.barrio && <div>Barrio: <span className="font-medium text-slate-800">{c.barrio}</span></div>}
                  </td>
                  <td className="px-4 py-2 text-slate-600 tabular-nums font-medium">
                    {c.ci}
                  </td>
                  <td className="px-4 py-2">
                    {c.dispositivo ? (
                      <Badge tono="ok">Vinculado</Badge>
                    ) : (
                      <Badge tono="alerta">Pendiente</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {c.dispositivo ? (
                      <BotonDesvincular dispositivoId={c.dispositivo.id} />
                    ) : (
                      <button 
                        onClick={() => abrirVincular(c)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Vincular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {paginaFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron choferes con esos criterios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Paginacion 
              currentPage={paginaActual} 
              totalPages={totalPages} 
              onPageChange={setPaginaActual} 
            />
          </div>
        )}
      </Card>

      {modalAbierto && choferSeleccionado && (
        <ModalVincular 
          chofer={choferSeleccionado} 
          onClose={() => {
            setModalAbierto(false);
            setChoferSeleccionado(null);
          }} 
        />
      )}
    </>
  );
}

function BotonDesvincular({ dispositivoId }: { dispositivoId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleBaja = () => {
    if (!confirm("¿Seguro que querés desvincular este dispositivo?")) return;
    
    startTransition(async () => {
      const res = await darDeBajaGPS(dispositivoId);
      if (res.error) alert(res.error);
    });
  };

  return (
    <button 
      onClick={handleBaja}
      disabled={isPending}
      className="text-xs text-rose-500 hover:text-rose-700 underline disabled:opacity-50"
    >
      {isPending ? "Desvinculando..." : "Desvincular"}
    </button>
  );
}

function ModalVincular({ chofer, onClose }: { chofer: ChoferGps, onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    startTransition(async () => {
      // Usamos la cédula directamente como unique_id (sin puntos)
      const res = await vincularGPS(chofer.id, "", chofer.ci);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-bold text-slate-900">Confirmar Vinculación</h3>
        
        <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
          <p><span className="font-semibold">Chofer:</span> {chofer.nombre_completo}</p>
          <p><span className="font-semibold">Cédula:</span> {formatearCI(chofer.ci)}</p>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          El identificador en Traccar será su número de cédula sin puntos: <strong className="tabular-nums">{chofer.ci}</strong>
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mt-6 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isPending}
              className="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
