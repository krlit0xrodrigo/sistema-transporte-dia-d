import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Boton, Campo, Card, CardHeader, claseInput } from "@/components/ui";

const ERRORES: Record<string, string> = {
  CI_OBLIGATORIO: "La cédula es obligatoria y debe ser numérica.",
  RESPONSABLE_OBLIGATORIO: "Indicá el supervisor o concejal que responde por este chofer.",
  CHOFER_DUPLICADO: "Esa cédula ya tiene una participación activa en esta elección.",
  LISTA_NEGRA: "La persona está en lista negra. Requiere una excepción aprobada.",
  CUPO_AGOTADO: "El cupo está agotado. Solicitá una excepción para avanzar.",
  SIN_PERMISO: "Tu usuario no tiene permiso para dar de alta choferes.",
};

function traducir(mensaje: string): string {
  for (const [codigo, texto] of Object.entries(ERRORES)) {
    if (mensaje.includes(codigo)) {
      return codigo === "CUPO_AGOTADO" ? `${texto} (${mensaje.split("CUPO_AGOTADO:")[1]?.trim()})` : texto;
    }
  }
  return mensaje;
}

export default async function NuevoChofer({
  searchParams,
}: { searchParams: Promise<{ error?: string; ci?: string }> }) {
  const sp = await searchParams;
  // El buscador manda acá con la cédula ya escrita cuando no encontró a
  // nadie: el operador no la vuelve a tipear ni se equivoca al copiarla.
  const ciPrecargada = (sp.ci ?? "").replace(/[^0-9]/g, "");
  const supabase = await crearClienteServidor();

  const [{ data: candidatos }, { data: barrios }, { data: supervisores }] = await Promise.all([
    supabase.from("candidatos").select("id, nombre_publico").eq("activo", true).order("nombre_publico"),
    supabase.from("barrios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("supervisores").select("id, alias").eq("activo", true).order("alias"),
  ]);

  async function alta(formData: FormData) {
    "use server";
    const s = await crearClienteServidor();
    const v = (k: string) => String(formData.get(k) ?? "").trim() || null;

    const supervisor = v("supervisor_id");
    const candidato = v("candidato_id");

    // Toda la cadena de validaciones vive en fn_alta_chofer, en una sola
    // transacción: CI, padrón, lista negra, duplicado y cupo en cascada.
    // Replicarla acá sería tener dos fuentes de verdad.
    const { data, error } = await s.rpc("fn_alta_chofer", {
      p: {
        ci: v("ci"),
        nombres: v("nombres"),
        apellidos: v("apellidos"),
        telefono: v("telefono"),
        candidato_id: candidato,
        barrio_id: v("barrio_id"),
        supervisor_id: supervisor,
        responsable_supervisor_id: supervisor,
        responsable_candidato_id: supervisor ? null : candidato,
        estado_servicio: v("estado_servicio"),
        chapa: v("chapa"),
        categoria: v("categoria"),
        marca: v("marca"),
        modelo: v("modelo"),
      },
    });

    if (error) redirect(`/choferes/nuevo?error=${encodeURIComponent(error.message)}`);
    redirect(`/choferes/${(data as { chofer_id: string }).chofer_id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Alta de chofer</h1>
        <p className="text-sm text-slate-500">
          La cédula se verifica contra el padrón y contra la lista negra antes de crear nada.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {traducir(decodeURIComponent(sp.error))}
        </div>
      )}

      <form action={alta}>
        <Card>
          <CardHeader titulo="Identidad" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo etiqueta="Cédula" nombre="ci" requerido ayuda="Sólo números. Se verifica contra el padrón.">
              <input id="ci" name="ci" required inputMode="numeric" defaultValue={ciPrecargada}
                     autoFocus={!ciPrecargada} className={claseInput} />
            </Campo>
            <Campo etiqueta="Teléfono" nombre="telefono" ayuda="0992 511-770">
              <input id="telefono" name="telefono" inputMode="tel" className={claseInput} />
            </Campo>
            <Campo etiqueta="Nombres" nombre="nombres" requerido>
              <input id="nombres" name="nombres" required className={claseInput} />
            </Campo>
            <Campo etiqueta="Apellidos" nombre="apellidos">
              <input id="apellidos" name="apellidos" className={claseInput} />
            </Campo>
          </div>

          <CardHeader titulo="Asignación" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo etiqueta="Candidato" nombre="candidato_id" requerido>
              <select id="candidato_id" name="candidato_id" required className={claseInput}>
                <option value="">Elegí un candidato</option>
                {(candidatos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre_publico}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Barrio" nombre="barrio_id">
              <select id="barrio_id" name="barrio_id" className={claseInput}>
                <option value="">Sin barrio</option>
                {(barrios ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Supervisor" nombre="supervisor_id"
                   ayuda="Si no hay supervisor, responde el concejal (RN-16).">
              <select id="supervisor_id" name="supervisor_id" className={claseInput}>
                <option value="">Sin supervisor</option>
                {(supervisores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.alias}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Estado de servicio" nombre="estado_servicio">
              <select id="estado_servicio" name="estado_servicio" className={claseInput}>
                <option value="contratado">Contratado</option>
                <option value="voluntario">Voluntario</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </Campo>
          </div>

          <CardHeader titulo="Vehículo (opcional)" />
          <div className="grid gap-4 p-4 sm:grid-cols-4">
            <Campo etiqueta="Chapa" nombre="chapa">
              <input id="chapa" name="chapa" className={claseInput} />
            </Campo>
            <Campo etiqueta="Categoría" nombre="categoria">
              <select id="categoria" name="categoria" className={claseInput}>
                <option value="">—</option>
                <option value="automovil">Automóvil</option>
                <option value="camioneta">Camioneta</option>
                <option value="minibus">Minibús</option>
                <option value="motocicleta">Motocicleta</option>
              </select>
            </Campo>
            <Campo etiqueta="Marca" nombre="marca">
              <input id="marca" name="marca" className={claseInput} />
            </Campo>
            <Campo etiqueta="Modelo" nombre="modelo">
              <input id="modelo" name="modelo" className={claseInput} />
            </Campo>
          </div>

          <div className="border-t border-slate-200 px-4 py-3">
            <Boton type="submit">Dar de alta</Boton>
          </div>
        </Card>
      </form>
    </div>
  );
}
