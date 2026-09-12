import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Boton, Campo, Card, CardHeader, Vacio, claseInput } from "@/components/ui";
import type { CupoConsumo } from "@/types/database";

export default async function Cupos({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: cupos }, { data: candidatos }, { data: barrios }, { data: supervisores }] =
    await Promise.all([
      supabase.from("v_cupos_consumo").select("*").order("ambito").order("etiqueta"),
      supabase.from("candidatos").select("id, nombre_publico").eq("activo", true).order("nombre_publico"),
      supabase.from("barrios").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("supervisores").select("id, alias").eq("activo", true).order("alias"),
    ]);

  const lista = (cupos ?? []) as CupoConsumo[];

  async function definir(formData: FormData) {
    "use server";
    const s = await crearClienteServidor();
    const ambito = String(formData.get("ambito"));
    const destino = String(formData.get("destino") || "") || null;
    const limite = Number(formData.get("limite"));

    const { data: eleccion } = await s
      .from("elecciones").select("id, organizacion_id").eq("estado", "activa").maybeSingle();
    if (!eleccion) return;

    const { error } = await s.from("cupos").insert({
      organizacion_id: eleccion.organizacion_id,
      eleccion_id: eleccion.id,
      ambito,
      candidato_id: ambito === "candidato" ? destino : null,
      barrio_id: ambito === "barrio" ? destino : null,
      supervisor_id: ambito === "supervisor" ? destino : null,
      limite,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/cupos");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cupos</h1>
        <p className="text-sm text-slate-500">
          Los tres ámbitos se validan en cascada: un alta consume candidato, barrio y supervisor
          a la vez. Un ámbito sin cupo definido no restringe.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <CardHeader titulo="Definir un cupo" />
        <form action={definir} className="grid gap-4 p-4 sm:grid-cols-4">
          <Campo etiqueta="Ámbito" nombre="ambito" requerido>
            <select id="ambito" name="ambito" required className={claseInput}>
              <option value="candidato">Candidato</option>
              <option value="barrio">Barrio</option>
              <option value="supervisor">Supervisor</option>
              <option value="global">Global</option>
            </select>
          </Campo>
          <div className="sm:col-span-2">
            <Campo etiqueta="Destino" nombre="destino"
                   ayuda="Dejalo vacío si el ámbito es global.">
              <select id="destino" name="destino" className={claseInput}>
                <option value="">—</option>
                <optgroup label="Candidatos">
                  {(candidatos ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre_publico}</option>
                  ))}
                </optgroup>
                <optgroup label="Barrios">
                  {(barrios ?? []).map((b) => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                </optgroup>
                <optgroup label="Supervisores">
                  {(supervisores ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.alias}</option>
                  ))}
                </optgroup>
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Límite" nombre="limite" requerido>
            <input id="limite" name="limite" type="number" min={0} required className={claseInput} />
          </Campo>
          <div className="sm:col-span-4">
            <Boton type="submit">Guardar cupo</Boton>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader titulo="Consumo" extra={<span className="text-xs text-slate-500">{lista.length} definidos</span>} />
        {lista.length === 0 ? (
          <Vacio mensaje="No hay cupos definidos todavía. Mientras no los haya, el alta de choferes no se bloquea por cupo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Ámbito</th>
                  <th className="px-4 py-2 font-medium">Destino</th>
                  <th className="px-4 py-2 text-right font-medium">Usado</th>
                  <th className="px-4 py-2 text-right font-medium">Límite</th>
                  <th className="px-4 py-2 text-right font-medium">Disponible</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((c) => {
                  const pct = Number(c.porcentaje);
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-slate-500">{c.ambito}</td>
                      <td className="px-4 py-2 font-medium">{c.etiqueta}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.usado}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.limite}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.disponible}</td>
                      <td className="px-4 py-2">
                        <Badge tono={pct >= 100 ? "error" : pct >= 80 ? "alerta" : "ok"}>
                          {pct >= 100 ? "Agotado" : pct >= 80 ? "Al límite" : "Disponible"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
