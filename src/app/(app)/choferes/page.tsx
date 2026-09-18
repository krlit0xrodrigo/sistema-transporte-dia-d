import Link from "next/link";
import { crearClienteServidor, crearClienteAdmin } from "@/lib/supabase/server";
import {
  Aviso, Badge, BotonEnlace, Card, CardHeader, Tabla, Th, Titulo, Vacio,
} from "@/components/ui";
import { Buscador } from "@/components/buscador";
import { formatearCI, formatearTelefono } from "@/lib/format";
import { Paginacion } from "@/components/ui/pagination";
import { FiltrosTablaChoferes } from "./filtros-tabla";

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

type SP = Promise<{ vista?: string; page?: string; candidato?: string; barrio?: string; padron?: string; ci?: string; nombre?: string }>;

export default async function Choferes({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const vista = sp.vista === "historico" ? "historico" : "operativo";
  const currentPage = parseInt(sp.page || "1", 10) || 1;
  const limit = 50;
  const offset = (currentPage - 1) * limit;
  const supabase = await crearClienteServidor();
  const supabaseAdmin = crearClienteAdmin();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRoles } = await supabase
    .from("usuario_roles")
    .select("roles!inner(codigo)")
    .eq("usuario_id", user?.id) as { data: { roles: { codigo: string } }[] | null };
  
  const roles = userRoles?.map(r => r.roles.codigo) || [];
  const esConsulta = roles.includes("consulta");
  const esTerritorial = roles.includes("candidato") || roles.includes("concejal");
  
  const [{ data: puedeCrear }, { data: eleccion }] = await Promise.all([
    supabase.rpc("auth_tiene_permiso", { p_codigo: "choferes.crear" }),
    supabase.from("elecciones").select("id, nombre").eq("estado", "activa").maybeSingle()
  ]);

  // Usamos admin bypass SOLO si es rol consulta puro (sin ser candidato/concejal).
  // Para candidato/concejal, usamos la conexión normal para que RLS filtre su propio alcance.
  // Superadmin y admin ya ven todo naturalmente a través de RLS.
  const dbActual = (esConsulta && !esTerritorial) ? supabaseAdmin : supabase;

  // Solo mostramos en los filtros los candidatos y barrios que están en la estructura activa actual
  const { data: estructuraActiva } = await dbActual
    .from("v_caja")
    .select("candidato, barrio")
    .eq("eleccion_id", eleccion?.id || "");

  const listaCandidatos = Array.from(new Set((estructuraActiva || []).map(e => e.candidato).filter(Boolean))).sort();
  const listaBarrios = Array.from(new Set((estructuraActiva || []).map(e => e.barrio).filter(Boolean))).sort();

  let qActual = dbActual
        .from("v_choferes_ficha")
        .select("chofer_id, ci, nombre_completo, telefono_e164, candidato, barrio, supervisor, estado_identidad, numero_orden", { count: "exact" })
        .eq("eleccion_id", eleccion?.id || "")
        .is("origen_planilla_id", null)
        .neq("estado", "baja")
        .order("nombre_completo");

  if (sp.candidato) qActual = qActual.eq("candidato", sp.candidato);
  if (sp.barrio) qActual = qActual.eq("barrio", sp.barrio);
  if (sp.padron) qActual = qActual.eq("estado_identidad", sp.padron);
  if (sp.ci) qActual = qActual.ilike("ci", `%${sp.ci.replace(/\./g, "")}%`);
  if (sp.nombre) qActual = qActual.ilike("nombre_completo", `%${sp.nombre}%`);

  const { data: actuales, count: totalActual, error: errorActual } = eleccion
    ? await qActual.range(offset, offset + limit - 1)
    : { data: null, count: 0, error: null };

  const totalPages = Math.max(1, Math.ceil((totalActual || 0) / limit));

  // La separación histórico / operativo se apoya en `origen_planilla_id`,
  // que la migración 0008 agrega a la vista. Si todavía no se aplicó, es
  // mejor decirlo con todas las letras que mostrar una pantalla rota.
  const faltaMigracion = Boolean(
    errorActual?.message?.includes("origen_planilla_id") ||
    errorActual?.message?.includes("numero_orden"));



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
        accion={puedeCrear ? <BotonEnlace href="/choferes/nuevo">Dar de alta</BotonEnlace> : undefined}
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
        <Buscador autoFocus ambito="operativo" />
      </Card>
        <Card>
          <CardHeader
            titulo="Operación actual"
            descripcion={eleccion?.nombre ?? "Sin elección activa"}
            extra={<span className="text-xs text-tinta-tenue">{totalActual ?? 0} registros encontrados</span>}
          />
          {filas.length === 0 && !sp.candidato && !sp.barrio && !sp.padron && !sp.ci && !sp.nombre ? (
            <Vacio
              mensaje="Todavía no hay choferes en el operativo actual"
              detalle="Es lo esperado: el operativo del 4 de octubre arranca vacío. Los 599 registros de las planillas son el histórico de la interna del 7 de junio y están en la otra pestaña. Cada chofer de este operativo se da de alta acá, y al cargarlo vas a ver sus antecedentes de junio antes de confirmarlo."
              accion={puedeCrear ? <BotonEnlace href="/choferes/nuevo">Dar de alta el primero</BotonEnlace> : undefined}
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
                <FiltrosTablaChoferes candidatos={listaCandidatos as string[]} barrios={listaBarrios as string[]} />
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-tinta-suave">
                      No se encontraron choferes con los filtros aplicados.
                    </td>
                  </tr>
                ) : filas.map((c) => (
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
          <div className="p-4 border-t border-zinc-100 flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium hidden sm:block">
              Mostrando {totalActual === 0 ? 0 : (currentPage - 1) * limit + 1} a {Math.min(currentPage * limit, totalActual || 0)} de {totalActual || 0}
            </p>
            <Paginacion currentPage={currentPage} totalPages={totalPages} />
          </div>
        </Card>
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
