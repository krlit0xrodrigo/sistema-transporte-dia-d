"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { darDeBajaChofer } from "./actions";

export function BotonBaja({ choferId }: { choferId: string }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleBaja = async () => {
    if (!motivo.trim()) {
      setError("Por favor, ingresa un motivo para la baja.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await darDeBajaChofer(choferId, motivo.trim());

    if (result.ok) {
      setOpen(false);
      // Redirigir a la lista general
      router.push("/choferes");
    } else {
      setError(result.error || "Ocurrió un error inesperado al dar de baja.");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMotivo("");
          setError(null);
        }}
        className="inline-flex items-center gap-2 rounded-md bg-transparent px-3 py-1.5 text-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-1 transition-colors"
      >
        <AlertTriangle className="h-4 w-4" />
        Dar de baja
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-tinta">Dar de baja al chofer</h2>
              <p className="mt-2 text-sm text-tinta-suave">
                Esta acción liberará todos sus cupos y lo removerá de la lista de operativos activos. El registro quedará en el historial de forma permanente, pero se le marcará como inactivo.
              </p>
              
              <div className="mt-4 space-y-2">
                <label htmlFor="motivo-baja" className="text-sm font-medium text-tinta">
                  Motivo de la baja <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="motivo-baja"
                  className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-tinta-tenue focus:border-rojo-500 focus:outline-none focus:ring-1 focus:ring-rojo-500"
                  placeholder="Ej: Alta duplicada, error de tipeo, etc."
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="mt-4 rounded-md bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive">{error}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 bg-zinc-50 px-6 py-4 border-t border-border/50">
              <button
                type="button"
                disabled={loading}
                className="rounded-md border border-border/50 bg-white px-4 py-2 text-sm font-medium text-tinta hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading || !motivo.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50 shadow-sm transition-colors"
                onClick={handleBaja}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar baja
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
