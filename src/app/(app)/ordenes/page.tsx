import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Boton, Campo, Card, CardHeader, Vacio, claseInput } from "@/components/ui";
import { anularFolio, crearSerie } from "@/lib/acciones";

const TIPOS = [
  ["contrato", "Contrato"],
  ["vale_combustible", "Vale de combustible"],
  ["anticipo", "Anticipo"],
  ["pago_final", "Pago final"],
] as const;
const ETIQUETA = Object.fromEntries(TIPOS) as Record<string, string>;

interface Serie {
  id: string; tipo_documento: string; prefijo: string; desde: number; hasta: number;
  estado: string; total: number; disponibles: number; usados: number; anulados: number;
}

export default async function Ordenes() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_folios_series").select("*").order("tipo_documento").order("desde");
  const series = (data ?? []) as Serie[];

  const { data: anulables } = await supabase
    .from("folios").select("id, numero, serie_id").eq("estado", "disponible")
    .order("numero").limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Órdenes de transporte</h1>
        <p className="text-sm text-slate-500">
          Cada chofer recibe un número de orden. Un número se usa una sola vez y no se reutiliza: la asignación toma el
          siguiente disponible con bloqueo, así que dos personas emitiendo a la vez nunca
          reciben el mismo número.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error.message.includes("permission") || error.message.includes("policy")
            ? "Tu usuario no tiene permiso para ver las órdenes."
            : error.message}
        </div>
      )}

      <Card>
        <CardHeader titulo="Emitir un talonario" />
        <form action={crearSerie as (fd: FormData) => void} className="grid gap-4 p-4 sm:grid-cols-5">
          <Campo etiqueta="Tipo" nombre="tipo" requerido>
            <select id="tipo" name="tipo" required className={claseInput}>
              {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Prefijo" nombre="prefijo" ayuda="Opcional">
            <input id="prefijo" name="prefijo" className={claseInput} placeholder="C-" />
          </Campo>
          <Campo etiqueta="Desde" nombre="desde" requerido>
            <input id="desde" name="desde" type="number" min={1} required className={claseInput} />
          </Campo>
          <Campo etiqueta="Hasta" nombre="hasta" requerido>
            <input id="hasta" name="hasta" type="number" min={1} required className={claseInput} />
          </Campo>
          <div className="flex items-end">
            <Boton type="submit">Emitir</Boton>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader titulo="Talonarios" extra={<span className="text-xs text-slate-500">{series.length}</span>} />
        {series.length === 0 ? (
          <Vacio mensaje="Todavía no hay talonarios."
                 detalle="Sin números disponibles, los documentos se crean igual pero salen sin número de orden, y la planilla impresa queda sin la columna que el chofer firma." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Rango</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Disponibles</th>
                  <th className="px-4 py-2 text-right font-medium">Usados</th>
                  <th className="px-4 py-2 text-right font-medium">Anulados</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {series.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-medium">{ETIQUETA[s.tipo_documento] ?? s.tipo_documento}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-600">
                      {s.prefijo}{s.desde} – {s.prefijo}{s.hasta}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.total}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.disponibles}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.usados}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.anulados}</td>
                    <td className="px-4 py-2">
                      <Badge tono={s.disponibles === 0 ? "error" : s.disponibles < 10 ? "alerta" : "ok"}>
                        {s.disponibles === 0 ? "Agotada" : s.disponibles < 10 ? "Quedan pocos" : "Disponible"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader titulo="Anular un número" />
        <form action={anularFolio as (fd: FormData) => void} className="grid gap-4 p-4 sm:grid-cols-3">
          <Campo etiqueta="Número disponible" nombre="folio_id" requerido>
            <select id="folio_id" name="folio_id" required className={claseInput}>
              {(anulables ?? []).map((f) => (
                <option key={f.id} value={f.id}>Nº {f.numero}</option>
              ))}
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo etiqueta="Motivo" nombre="motivo" requerido
                   ayuda="Una anulación sin motivo no es auditable, así que la base la rechaza.">
              <input id="motivo" name="motivo" required className={claseInput}
                     placeholder="talonario dañado" />
            </Campo>
          </div>
          <div className="sm:col-span-3">
            <Boton type="submit" tipo="secundario">Anular número</Boton>
          </div>
        </form>
        <p className="px-4 pb-3 text-xs text-slate-400">
          Sólo se pueden anular números disponibles: uno ya usado por un documento queda como está.
        </p>
      </Card>
    </div>
  );
}
