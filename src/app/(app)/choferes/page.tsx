import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  Aviso, Badge, BotonEnlace, Card, CardHeader, Tabla, Th, Titulo, Vacio,
} from "@/components/ui";
import { Buscador } from "@/components/buscador";
import { formatearCI, formatearTelefono } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Choferes.
 *
 * DOS LISTAS QUE NO SE MEZCLAN
 * ----------------------------
 * · **Operación actual**: los choferes dados de alta para el Día D del
 *   4 de octubre. Empieza vacía, y eso es correcto: nadie fue dado de alta
 *   todavía. Un listado que arranca con 599 nombres que nadie cargó es un
 *   listado en el que no se puede confiar.
 *
 * · **Histórico**: las participaciones que vinieron de las planillas de la
 *   interna del 07/06/2026. Se conservan enteras —sirven para saber quién
 *   trabajó, quién no y cuántos kilómetros hizo— pero no son el operativo
 *   de hoy. Se consultan buscando, nunca listando: son 599 y traerlas a la
 *   pantalla sin que nadie las pida es lo que hacía lenta esta página.
 *
 * El discriminador es `origen_planilla_id`: nulo cuando el alta se hizo
 * desde esta aplicación, lleno cuando vino de una planilla.
 */

const TONO_IDENTIDAD = {
  verificada: "ok",
  fuera_de_padron: "alerta",
  discrepancia_nombre: "error",
} as const;

type SP = Promise<{ vista?: string }>;

export default async function Choferes({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const vista = sp.vista === "historico" ? "historico" : "operativo";
  const supabase = await crearClienteServidor();

  const { data: eleccion } = await supabase
    .from("elecciones").select("id, nombre").eq("estado", "activa").maybeSingle();

  // La operación actual se lista entera porque empieza vacía y va a crecer
  // de a uno: cuando tenga 300 filas se pagina. El histórico NO se lista:
  // se busca.
  const { data: actuales, count: totalActual, error: errorActual } = vista === "operativo" && eleccion
    ? await supabase
        .from("v_choferes_ficha")
        .select("chofer_id, ci, nombre_completo, telefono_e164, candidato, barrio, supervisor, estado_identidad, numero_orden", { count: "exact" })
        .eq("eleccion_id", eleccion.id)
        .is("origen_planilla_id", null)
        .neq("estado", "baja")
        .order("nombre_completo")
        .limit(200)
    : { data: null, count: 0, error: null };

  // La separación histórico / operativo se apoya en `origen_planilla_id`,
  // que la migración 0008 agrega a la vista. Si todavía no se aplicó, es
  // mejor decirlo con todas las letras que mostrar una pantalla rota.
  const faltaMigracion = Boolean(
    errorActual?.message?.includes("origen_planilla_id") ||
    errorActual?.message?.includes("numero_orden"));

  const { count: totalHistorico } = await supabase
    .from("v_choferes_ficha")
    .select("*", { count: "exact", head: true })
    .not("origen_planilla_id", "is", null);

  type Fila = {
    chofer_id: string; ci: string; nombre_completo: string; telefono_e164: string | null;
    candidato: string | null; barrio: string | null; supervisor: string | null;
    estado_identidad: keyof typeof TONO_IDENTIDAD; numero_orden: number | null;
  };
  const filas = (actuales ?? []) as unknown as Fila[];

  return (
    <div className="space-y-6">
      <Titulo
        descripcion="Buscá por cédula, nombre o apellido. La cédula funciona con puntos o sin puntos."
        accion={<BotonEnlace href="/choferes/nuevo">Dar de alta</BotonEnlace>}
      >
        Choferes
      </Titulo>

      {faltaMigracion && (
        <Aviso tono="alerta">
          <strong>Falta aplicar las migraciones nuevas.</strong> La separación entre el histórico
          del 7 de junio y el operativo actual se apoya en columnas que agregan las migraciones
          0007, 0008 y 0009. Corré <code>supabase db push</code> y recargá esta página.
        </Aviso>
      )}

      <Card className="p-4">
        <Buscador autoFocus />
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Qué listado ver">
        <Pestania href="/choferes" activa={vista === "operativo"}
                  texto="Operación actual" cuenta={totalActual ?? 0} />
        <Pestania href="/choferes?vista=historico" activa={vista === "historico"}
                  texto="Histórico · interna 07/06/2026" cuenta={totalHistorico ?? 0} />
      </div>

      {vista === "historico" ? (
        <Card>
          <CardHeader
            titulo="Histórico de la interna del 7 de junio de 2026"
            descripcion="Se conserva completo. No es el operativo actual."
          />
          <Vacio
            mensaje={`${totalHistorico ?? 0} participaciones históricas`}
            detalle="Se consultan buscando arriba por cédula, nombre o apellido. No se listan de una: traer 599 filas a la pantalla sin que nadie las pida es lo que hacía lenta esta página. Cada ficha muestra si esa persona trabajó el 7 de junio, con quién y cuántos kilómetros hizo."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            titulo="Operación actual"
            descripcion={eleccion?.nombre ?? "Sin elección activa"}
            extra={<span className="text-xs text-tinta-tenue">{filas.length} de {totalActual ?? 0}</span>}
          />
          {filas.length === 0 ? (
            <Vacio
              mensaje="Todavía no hay choferes en el operativo actual"
              detalle="Es lo esperado: el operativo del 4 de octubre arranca vacío. Los 599 registros de las planillas son el histórico de la interna del 7 de junio y están en la otra pestaña. Cada chofer de este operativo se da de alta acá, y al cargarlo vas a ver sus antecedentes de junio antes de confirmarlo."
              accion={<BotonEnlace href="/choferes/nuevo">Dar de alta el primero</BotonEnlace>}
            />
          ) : (
            <Tabla>
              <thead className="bg-zinc-50">
                <tr>
                  <Th numerico>Orden</Th>
                  <Th>Cédula</Th>
                  <Th>Nombre</Th>
                  <Th>Candidato</Th>
                  <Th>Barrio</Th>
                  <Th>Teléfono</Th>
                  <Th>Padrón</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filas.map((c) => (
                  <tr key={c.chofer_id} className="hover:bg-rojo-50/40">
                    <td className="px-4 py-2.5 text-right tabular-nums text-tinta-suave">
                      {c.numero_orden ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      <Link href={`/choferes/${c.chofer_id}`}
                            className="font-semibold text-rojo-700 underline underline-offset-4">
                        {formatearCI(c.ci)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{c.nombre_completo}</td>
                    <td className="px-4 py-2.5 text-tinta-suave">{c.candidato ?? "—"}</td>
                    <td className="px-4 py-2.5 text-tinta-suave">{c.barrio ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-tinta-suave">
                      {formatearTelefono(c.telefono_e164)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tono={TONO_IDENTIDAD[c.estado_identidad] ?? "neutro"}>
                        {c.estado_identidad === "verificada" ? "Verificado"
                          : c.estado_identidad === "fuera_de_padron" ? "Fuera de padrón"
                          : "Nombre no coincide"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      )}
    </div>
  );
}

function Pestania({ href, activa, texto, cuenta }: {
  href: string; activa: boolean; texto: string; cuenta: number;
}) {
  return (
    <Link href={href} role="tab" aria-selected={activa}
      className={[
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        activa
          ? "bg-rojo text-white shadow-tarjeta"
          : "bg-white text-tinta-suave ring-1 ring-inset ring-borde hover:bg-zinc-50",
      ].join(" ")}>
      {texto}
      <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${activa ? "bg-white/20" : "bg-zinc-100 text-tinta-tenue"}`}>
        {cuenta}
      </span>
    </Link>
  );
}
