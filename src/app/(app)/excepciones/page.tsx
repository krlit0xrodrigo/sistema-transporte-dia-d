import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Boton, Card, CardHeader, Vacio } from "@/components/ui";
import { formatearCI, formatearFecha } from "@/lib/format";
import { aprobarExcepcion, rechazarExcepcion } from "./actions";
import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Excepciones" };

export default async function ExcepcionesPage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_excepciones")
    .select("*")
    .order("created_at", { ascending: false });

  const entradas = (data ?? []) as any[];
  const pendientes = entradas.filter((e) => e.estado === "pendiente");
  const resueltas = entradas.filter((e) => e.estado !== "pendiente");

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Bandeja de solicitudes de excepción para altas bloqueadas. Un usuario no puede aprobar su propia solicitud.">
        Excepciones
      </PageHeader>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Tu usuario no tiene permiso para ver las excepciones o hubo un error.
        </div>
      )}

      <Card>
        <CardHeader titulo="Pendientes de aprobación" extra={<span className="text-xs text-slate-500">{pendientes.length}</span>} />
        {pendientes.length === 0 ? (
          <Vacio mensaje="No hay solicitudes de excepción pendientes." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendientes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.nombre_completo}</p>
                  <p className="text-xs tabular-nums text-slate-500">{formatearCI(e.ci)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.tipo}</p>
                  <p className="text-xs text-slate-500">{e.motivo}</p>
                </div>
                <div className="text-xs text-slate-500">
                  <p>Solicitado por: {e.solicitado_por_nombre}</p>
                  <p>{formatearFecha(e.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <form action={aprobarExcepcion}>
                    <input type="hidden" name="id" value={e.id} />
                    <Boton type="submit" className="bg-emerald-600 hover:bg-emerald-700 py-1 text-xs">Aprobar</Boton>
                  </form>
                  <form action={rechazarExcepcion}>
                    <input type="hidden" name="id" value={e.id} />
                    <Boton type="submit" tipo="peligro" className="py-1 text-xs">Rechazar</Boton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {resueltas.length > 0 && (
        <Card>
          <CardHeader titulo="Historial de excepciones" extra={<span className="text-xs text-slate-500">{resueltas.length}</span>} />
          <ul className="divide-y divide-slate-100">
            {resueltas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-2 text-sm opacity-70">
                <div className="w-1/4">
                  <span className="font-medium">{e.nombre_completo}</span>
                  <p className="text-xs tabular-nums text-slate-500">{formatearCI(e.ci)}</p>
                </div>
                <div className="w-1/4">
                  <p>{e.tipo}</p>
                  <span className="text-xs text-slate-500">{e.motivo}</span>
                </div>
                <div className="w-1/4 text-xs text-slate-500">
                  <p>Sol: {e.solicitado_por_nombre}</p>
                  <p>Res: {e.aprobado_por_nombre ?? "-"}</p>
                </div>
                <div className="w-1/4 text-right">
                  <Badge tono={e.estado === "aprobada" ? "ok" : "error"}>{e.estado}</Badge>
                  {e.vence_en && <p className="text-xs text-slate-400 mt-1">Vence: {formatearFecha(e.vence_en)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
