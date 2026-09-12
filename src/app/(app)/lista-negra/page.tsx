import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Boton, Campo, Card, CardHeader, Vacio, claseInput } from "@/components/ui";
import { formatearCI, formatearFecha } from "@/lib/format";
import { agregarListaNegra, revocarListaNegra } from "@/lib/acciones";

const MOTIVOS = [
  ["incumplio_operativo", "Incumplió el operativo"],
  ["cobro_sin_servicio", "Cobró sin prestar servicio"],
  ["documentacion_falsa", "Documentación falsa"],
  ["vehiculo_no_habilitado", "Vehículo no habilitado"],
  ["conducta", "Conducta"],
  ["doble_imputacion", "Doble imputación entre candidatos"],
  ["a_pedido_de_la_persona", "A pedido de la persona"],
  ["otro", "Otro (requiere detalle)"],
] as const;

const ETIQUETA = Object.fromEntries(MOTIVOS) as Record<string, string>;

interface Entrada {
  id: string; ci: string; nombre_completo: string;
  motivo_codigo: string; motivo_detalle: string | null; severidad: string;
  vigente_desde: string; vigente_hasta: string | null;
  revocado_en: string | null; motivo_revocacion: string | null; vigente: boolean;
}

export default async function ListaNegra() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_lista_negra").select("*").order("created_at", { ascending: false });
  const entradas = (data ?? []) as Entrada[];
  const vigentes = entradas.filter((e) => e.vigente);
  const historicas = entradas.filter((e) => !e.vigente);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Lista negra</h1>
        <p className="text-sm text-slate-500">
          Vive a nivel persona, no de chofer: un bloqueo sobrevive entre elecciones.
          Nada se borra — una entrada se revoca y queda el historial.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error.message.includes("permission") || error.message.includes("policy")
            ? "Tu usuario no tiene permiso para ver la lista negra."
            : error.message}
        </div>
      )}

      <Card>
        <CardHeader titulo="Agregar una entrada" />
        <form action={agregarListaNegra as (fd: FormData) => void} className="grid gap-4 p-4 sm:grid-cols-3">
          <Campo etiqueta="Cédula" nombre="ci" requerido ayuda="La persona tiene que existir en el sistema.">
            <input id="ci" name="ci" required inputMode="numeric" className={claseInput} />
          </Campo>
          <Campo etiqueta="Motivo" nombre="motivo" requerido>
            <select id="motivo" name="motivo" required className={claseInput}>
              {MOTIVOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Severidad" nombre="severidad">
            <select id="severidad" name="severidad" className={claseInput}>
              <option value="bloqueo_total">Bloqueo total</option>
              <option value="advertencia">Advertencia</option>
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo etiqueta="Detalle" nombre="detalle" ayuda="Obligatorio si el motivo es «Otro».">
              <input id="detalle" name="detalle" className={claseInput} />
            </Campo>
          </div>
          <Campo etiqueta="Vence" nombre="vence_en" ayuda="Vacío = indefinido (D-06).">
            <input id="vence_en" name="vence_en" type="date" className={claseInput} />
          </Campo>
          <div className="sm:col-span-3">
            <Boton type="submit">Agregar a la lista negra</Boton>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader titulo="Vigentes" extra={<span className="text-xs text-slate-500">{vigentes.length}</span>} />
        {vigentes.length === 0 ? (
          <Vacio mensaje="No hay entradas vigentes." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {vigentes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.nombre_completo}</p>
                  <p className="text-xs tabular-nums text-slate-500">{formatearCI(e.ci)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{ETIQUETA[e.motivo_codigo] ?? e.motivo_codigo}</p>
                  {e.motivo_detalle && <p className="text-xs text-slate-500">{e.motivo_detalle}</p>}
                </div>
                <Badge tono={e.severidad === "bloqueo_total" ? "error" : "alerta"}>
                  {e.severidad === "bloqueo_total" ? "Bloqueo total" : "Advertencia"}
                </Badge>
                <span className="text-xs text-slate-500">
                  {e.vigente_hasta ? `hasta ${formatearFecha(e.vigente_hasta)}` : "indefinido"}
                </span>
                <form action={revocarListaNegra as (fd: FormData) => void} className="flex gap-1">
                  <input type="hidden" name="id" value={e.id} />
                  <input name="motivo" required placeholder="Motivo de la revocación"
                         className="w-56 rounded-md px-2 py-1 text-xs ring-1 ring-inset ring-slate-300" />
                  <button className="rounded-md px-2 py-1 text-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                    Revocar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {historicas.length > 0 && (
        <Card>
          <CardHeader titulo="Revocadas y vencidas" extra={<span className="text-xs text-slate-500">{historicas.length}</span>} />
          <ul className="divide-y divide-slate-100">
            {historicas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="font-medium">{e.nombre_completo}</span>
                <span className="text-xs tabular-nums text-slate-500">{formatearCI(e.ci)}</span>
                <span className="text-slate-600">{ETIQUETA[e.motivo_codigo] ?? e.motivo_codigo}</span>
                <Badge>{e.revocado_en ? "Revocada" : "Vencida"}</Badge>
                {e.motivo_revocacion && (
                  <span className="text-xs text-slate-500">{e.motivo_revocacion}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
