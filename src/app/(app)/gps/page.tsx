import { revalidatePath } from "next/cache";
import { redirect as redirigir } from "next/navigation";
import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Boton, Campo, Card, CardHeader, Vacio, claseInput } from "@/components/ui";
import { formatearCI, formatearFecha } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Vinculación de dispositivos Traccar (D-04).
 *
 * El problema que esto resuelve está documentado en `docs/audit-datos.md`:
 * en el operativo anterior la actividad GPS se atribuía haciendo coincidir
 * el nombre del dispositivo en Traccar con el nombre del chofer en la
 * planilla. Con 52 nombres repetidos y 5 homónimos con cédulas distintas,
 * eso es adivinar.
 *
 * Acá el vínculo es una clave foránea: se busca la persona por CÉDULA, se
 * toma su participación activa en esta elección, y el `device_id` de
 * Traccar queda colgado de ese `chofer_id`. El índice único
 * `ux_disp_chofer` impide dos dispositivos activos para el mismo chofer y
 * `ux_disp_traccar` impide el mismo dispositivo en dos choferes.
 *
 * La ingesta de eventos NO pasa por acá: `traccar_eventos` tiene un
 * `with check (false)` para `authenticated`. Sólo el job server-side
 * escribe eventos (ROADMAP §4, 25–28 sep).
 */

const ESTADOS: Record<string, { texto: string; tono: "ok" | "alerta" | "neutro" | "error" }> = {
  activo: { texto: "Activo", tono: "ok" },
  pendiente_alta: { texto: "Pendiente de alta", tono: "alerta" },
  inactivo: { texto: "Inactivo", tono: "neutro" },
  baja: { texto: "De baja", tono: "error" },
};

type SP = Promise<{ error?: string; ok?: string }>;

export default async function Gps({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: dispositivos }, { count: choferes }] = await Promise.all([
    supabase
      .from("dispositivos_gps")
      .select("id, traccar_device_id, unique_id, nombre, estado, alta_en, ultimo_contacto, chofer_id, choferes(personas(ci, nombre_completo))")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("choferes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
  ]);

  type Dispositivo = {
    id: string;
    traccar_device_id: number | null;
    unique_id: string | null;
    nombre: string | null;
    estado: string;
    alta_en: string | null;
    ultimo_contacto: string | null;
    chofer_id: string | null;
    choferes: { personas: { ci: string; nombre_completo: string } | null } | null;
  };

  const lista = (dispositivos ?? []) as unknown as Dispositivo[];
  const vinculados = lista.filter((d) => d.chofer_id && d.estado !== "baja").length;

  /** Vincula por cédula. Todo o nada: si algo falla, no queda dispositivo huérfano. */
  async function vincular(formData: FormData) {
    "use server";
    const s = await crearClienteServidor();
    const volver = (error: string) => redirigir(`/gps?error=${encodeURIComponent(error)}`);

    const ci = String(formData.get("ci") ?? "").trim();
    const deviceId = String(formData.get("traccar_device_id") ?? "").trim();
    const uniqueId = String(formData.get("unique_id") ?? "").trim();
    const nombre = String(formData.get("nombre") ?? "").trim();

    if (!ci) return volver("La cédula es obligatoria: el vínculo se hace por cédula, no por nombre.");
    if (!deviceId && !uniqueId) {
      return volver("Hace falta el ID de Traccar o el identificador único del equipo.");
    }

    // La normalización de la cédula vive en SQL (fn_normalizar_ci), así que
    // se busca con la misma función que usó el importador.
    const { data: ciNormalizado } = await s.rpc("fn_normalizar_ci", { p: ci });
    if (!ciNormalizado) return volver("Esa cédula no tiene dígitos válidos.");

    const { data: persona } = await s
      .from("personas").select("id").eq("ci", ciNormalizado).maybeSingle();
    if (!persona) return volver(`No hay ninguna persona con la cédula ${ciNormalizado}.`);

    const { data: chofer } = await s
      .from("choferes")
      .select("id, eleccion_id, organizacion_id")
      .eq("persona_id", persona.id)
      .eq("estado", "activo")
      .is("deleted_at", null)
      .maybeSingle();
    if (!chofer) {
      return volver(`La cédula ${ciNormalizado} existe, pero no tiene una participación activa como chofer.`);
    }

    const { error } = await s.from("dispositivos_gps").insert({
      organizacion_id: chofer.organizacion_id,
      eleccion_id: chofer.eleccion_id,
      chofer_id: chofer.id,
      traccar_device_id: deviceId ? Number(deviceId) : null,
      unique_id: uniqueId || null,
      nombre: nombre || null,
      estado: "activo",
      alta_en: new Date().toISOString(),
    });

    if (error) {
      const m = error.message;
      if (m.includes("ux_disp_chofer")) return volver("Ese chofer ya tiene un dispositivo vinculado.");
      if (m.includes("ux_disp_traccar")) return volver("Ese ID de Traccar ya está vinculado a otro chofer.");
      if (m.includes("ux_disp_unique")) return volver("Ese identificador de equipo ya está en uso.");
      if (m.includes("row-level security")) {
        return volver("Tu usuario no tiene permiso para gestionar dispositivos (gps.gestionar_dispositivos).");
      }
      return volver(m);
    }

    revalidatePath("/gps");
    redirigir("/gps?ok=1");
  }

  async function darDeBaja(formData: FormData) {
    "use server";
    const s = await crearClienteServidor();
    const { error } = await s
      .from("dispositivos_gps")
      .update({ estado: "baja", baja_en: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    if (error) redirigir(`/gps?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/gps");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dispositivos GPS</h1>
        <p className="text-sm text-slate-500">
          El vínculo entre un equipo de Traccar y un chofer se hace por <strong>cédula</strong>.
          Nunca por nombre: en el operativo anterior esa fue la causa de la clasificación
          errónea de actividad (D-04).
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {decodeURIComponent(sp.error)}
        </div>
      )}
      {sp.ok && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Dispositivo vinculado.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums">{vinculados}</p>
          <p className="text-sm text-slate-600">Choferes con dispositivo</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums">{(choferes ?? 0) - vinculados}</p>
          <p className="text-sm text-slate-600">Choferes sin dispositivo</p>
          <p className="mt-1 text-xs text-slate-400">Quedan en <code>sin_dispositivo</code></p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold tabular-nums">{lista.length}</p>
          <p className="text-sm text-slate-600">Equipos registrados</p>
        </Card>
      </div>

      <Card>
        <CardHeader titulo="Vincular un equipo" />
        <form action={vincular} className="grid gap-4 p-4 sm:grid-cols-4">
          <Campo etiqueta="Cédula del chofer" nombre="ci" requerido
                 ayuda="Con o sin puntos. Se normaliza igual que en la importación.">
            <input id="ci" name="ci" required inputMode="numeric" className={claseInput} />
          </Campo>
          <Campo etiqueta="ID de Traccar" nombre="traccar_device_id"
                 ayuda="El `id` numérico del device.">
            <input id="traccar_device_id" name="traccar_device_id" inputMode="numeric" className={claseInput} />
          </Campo>
          <Campo etiqueta="Identificador del equipo" nombre="unique_id"
                 ayuda="El `uniqueId` (IMEI o similar).">
            <input id="unique_id" name="unique_id" className={claseInput} />
          </Campo>
          <Campo etiqueta="Nombre en Traccar" nombre="nombre"
                 ayuda="Sólo de referencia. No se usa para vincular.">
            <input id="nombre" name="nombre" className={claseInput} />
          </Campo>
          <div className="sm:col-span-4">
            <Boton type="submit">Vincular por cédula</Boton>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          titulo="Equipos vinculados"
          extra={<Link href="/reportes" className="text-xs text-slate-500 underline">Reportes</Link>}
        />
        {lista.length === 0 ? (
          <Vacio mensaje="Todavía no hay dispositivos vinculados. Sin dispositivo, la actividad del chofer queda en 'sin_dispositivo' y el pago final necesita excepción aprobada (C3)." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Cédula</th>
                  <th className="px-4 py-2 font-medium">Chofer</th>
                  <th className="px-4 py-2 font-medium">Traccar</th>
                  <th className="px-4 py-2 font-medium">Equipo</th>
                  <th className="px-4 py-2 font-medium">Alta</th>
                  <th className="px-4 py-2 font-medium">Último contacto</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((d) => {
                  const persona = d.choferes?.personas;
                  const estado = ESTADOS[d.estado] ?? { texto: d.estado, tono: "neutro" as const };
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-2 tabular-nums">
                        {persona ? formatearCI(persona.ci) : "—"}
                      </td>
                      <td className="px-4 py-2">{persona?.nombre_completo ?? "Sin chofer"}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">{d.traccar_device_id ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{d.unique_id ?? d.nombre ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{formatearFecha(d.alta_en)}</td>
                      <td className="px-4 py-2 text-slate-600">{formatearFecha(d.ultimo_contacto)}</td>
                      <td className="px-4 py-2"><Badge tono={estado.tono}>{estado.texto}</Badge></td>
                      <td className="px-4 py-2 text-right">
                        {d.estado !== "baja" && (
                          <form action={darDeBaja}>
                            <input type="hidden" name="id" value={d.id} />
                            <button className="text-xs text-slate-500 underline hover:text-rose-700">
                              Dar de baja
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        La ingesta de posiciones y la clasificación de actividad son un job server-side que
        corre el Día D y se calcula el 5 de octubre. <code>traccar_eventos</code> está cerrada
        a escritura para la aplicación: nadie puede inventar un evento desde la pantalla.
      </p>
    </div>
  );
}
