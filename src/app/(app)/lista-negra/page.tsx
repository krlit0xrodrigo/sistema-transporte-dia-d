import { crearClienteServidor } from "@/lib/supabase/server";
import { Campo, Card, CardHeader, claseInput, Boton } from "@/components/ui";
import { agregarListaNegra } from "@/lib/acciones";
import { ListaNegraClient } from "./lista-negra-client";

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

export default async function ListaNegra() {
  const supabase = await crearClienteServidor();
  
  // 1. Obtener Lista Negra
  const { data: dataLn, error } = await supabase
    .from("v_lista_negra")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Obtener Antecedentes (No Cumplió)
  const { data: dataAnt } = await supabase
    .from("v_antecedentes")
    .select("*")
    .eq("resultado", "no_cumplio");

  // 3. Obtener apariciones origen para cruzar candidato/supervisor
  const { data: apariciones } = await supabase
    .from("apariciones_origen")
    .select("persona_id, eleccion_id, candidato_texto, supervisor_texto");

  const entradas = (dataLn ?? []).map(r => ({
    id: r.id,
    ci: r.ci,
    nombre_completo: r.nombre_completo,
    motivo_codigo: r.motivo_codigo,
    motivo_detalle: r.motivo_detalle,
    severidad: r.severidad,
    vigente_desde: r.vigente_desde,
    vigente_hasta: r.vigente_hasta,
    revocado_en: r.revocado_en,
    motivo_revocacion: r.motivo_revocacion,
    vigente: r.revocado_en === null && new Date(r.vigente_desde) <= new Date() && (r.vigente_hasta === null || new Date(r.vigente_hasta) > new Date())
  }));

  const antecedentes = (dataAnt ?? []).map((a: any) => {
    // Buscar con quién estuvo en esa elección específica
    const apar = (apariciones ?? []).find(ap => ap.persona_id === a.persona_id && ap.eleccion_id === a.eleccion_id);
    return {
      ci: a.ci,
      nombre_completo: a.nombre_completo,
      candidato: apar?.candidato_texto || "",
      supervisor: apar?.supervisor_texto || "",
      resultado: a.resultado,
      eleccion_nombre: a.eleccion_nombre
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Lista negra y Antecedentes</h1>
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
          <div className="sm:col-span-3 flex justify-end mt-2">
            <Boton type="submit">Agregar a la lista negra</Boton>
          </div>
        </form>
      </Card>

      <ListaNegraClient entradas={entradas} antecedentes={antecedentes} />
    </div>
  );
}
