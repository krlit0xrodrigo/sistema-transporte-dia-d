import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Vacio } from "@/components/ui";
import type { CupoConsumo } from "@/types/database";

function Tarjeta({ valor, etiqueta, detalle }: { valor: number | string; etiqueta: string; detalle?: string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-sm text-slate-600">{etiqueta}</p>
      {detalle && <p className="mt-1 text-xs text-slate-400">{detalle}</p>}
    </Card>
  );
}

/** Verde < 80 % · amarillo 80–99 % · rojo al 100 % (docs/workflows.md §5). */
function semaforo(pct: number) {
  if (pct >= 100) return { tono: "error" as const, texto: "Agotado" };
  if (pct >= 80) return { tono: "alerta" as const, texto: "Al límite" };
  return { tono: "ok" as const, texto: "Disponible" };
}

export default async function Tablero() {
  const supabase = await crearClienteServidor();

  const [{ count: choferes }, { count: verificados }, { count: conflictos }, { data: cupos }] =
    await Promise.all([
      supabase.from("choferes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
      supabase.from("personas").select("*", { count: "exact", head: true }).eq("estado_identidad", "verificada"),
      supabase.from("importacion_filas").select("*", { count: "exact", head: true }).eq("estado", "conflicto"),
      supabase.from("v_cupos_consumo").select("*").order("porcentaje", { ascending: false }),
    ]);

  const lista = (cupos ?? []) as CupoConsumo[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tablero</h1>
        <p className="text-sm text-slate-500">Día D — Municipales Villa Hayes · 4 de octubre de 2026</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tarjeta valor={choferes ?? 0} etiqueta="Choferes activos" />
        <Tarjeta valor={verificados ?? 0} etiqueta="Verificados en el padrón" />
        <Tarjeta valor={conflictos ?? 0} etiqueta="Filas en conflicto"
                 detalle="Esperan resolución humana" />
      </div>

      <Card>
        <CardHeader titulo="Cupos" extra={<Link href="/cupos" className="text-xs text-slate-500 underline">Gestionar</Link>} />
        {lista.length === 0 ? (
          <Vacio mensaje="Todavía no hay cupos definidos. Sin cupo, ningún ámbito restringe el alta." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {lista.slice(0, 12).map((c) => {
              const pct = Number(c.porcentaje);
              const s = semaforo(pct);
              return (
                <li key={c.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.etiqueta}</p>
                    <p className="text-xs text-slate-500">{c.ambito}</p>
                  </div>
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                         style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="w-24 text-right text-sm tabular-nums text-slate-600">
                    {c.usado} / {c.limite}
                  </span>
                  <Badge tono={s.tono}>{s.texto}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
