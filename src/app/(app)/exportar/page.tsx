import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Campo, Vacio, claseInput } from "@/components/ui";
import { formatearFecha } from "@/lib/format";
import {
  LIMITE_EXPORTACIONES, VENTANA_MINUTOS, describirFiltros, leerFiltros,
} from "@/lib/exportacion";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function comoQuery(f: Record<string, string | null | undefined>, extra: Record<string, string> = {}) {
  const q = new URLSearchParams();
  Object.entries({ ...f, ...extra }).forEach(([k, v]) => { if (v) q.set(k, v); });
  return q.toString();
}

export default async function Exportar({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filtros = leerFiltros(sp);
  const supabase = await crearClienteServidor();

  const [{ data: candidatos }, { data: barrios }, { data: supervisores }, { data: recientes }] =
    await Promise.all([
      supabase.from("candidatos").select("nombre_publico").eq("activo", true).order("nombre_publico"),
      supabase.from("barrios").select("nombre").eq("activo", true).order("nombre"),
      supabase.from("supervisores").select("alias").eq("activo", true).order("alias"),
      supabase.from("exportaciones")
        .select("id, tipo, formato, filas, incluye_pii, created_at")
        .order("created_at", { ascending: false }).limit(10),
    ]);

  // Cuántas filas va a traer la selección actual, con las mismas reglas de
  // RLS que va a aplicar la exportación: el número que se ve es el número
  // que se descarga.
  let conteo = supabase.from("v_choferes_ficha").select("*", { count: "exact", head: true });
  if (filtros.estado) conteo = conteo.eq("estado", filtros.estado);
  if (filtros.candidato) conteo = conteo.eq("candidato", filtros.candidato);
  if (filtros.barrio) conteo = conteo.eq("barrio", filtros.barrio);
  if (filtros.supervisor) conteo = conteo.eq("supervisor", filtros.supervisor);
  const { count } = await conteo;

  const qs = comoQuery(filtros as Record<string, string | null>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Exportar</h1>
        <p className="text-sm text-slate-500">
          Las planillas del Día D. El XLSX es para trabajar; la vista de impresión sale en
          papel y es el plan B si el 4 de octubre no hay señal.
        </p>
      </div>

      <Card>
        <CardHeader titulo="Qué exportar" />
        <form method="get" className="grid gap-4 p-4 sm:grid-cols-4">
          <Campo etiqueta="Candidato" nombre="candidato">
            <select id="candidato" name="candidato" defaultValue={filtros.candidato ?? ""} className={claseInput}>
              <option value="">Todos</option>
              {(candidatos ?? []).map((c) => (
                <option key={c.nombre_publico} value={c.nombre_publico}>{c.nombre_publico}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Barrio" nombre="barrio">
            <select id="barrio" name="barrio" defaultValue={filtros.barrio ?? ""} className={claseInput}>
              <option value="">Todos</option>
              {(barrios ?? []).map((b) => (
                <option key={b.nombre} value={b.nombre}>{b.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Supervisor" nombre="supervisor">
            <select id="supervisor" name="supervisor" defaultValue={filtros.supervisor ?? ""} className={claseInput}>
              <option value="">Todos</option>
              {(supervisores ?? []).map((s) => (
                <option key={s.alias} value={s.alias}>{s.alias}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Estado" nombre="estado">
            <select id="estado" name="estado" defaultValue={filtros.estado ?? "activo"} className={claseInput}>
              <option value="activo">Activos</option>
              <option value="suspendido">Suspendidos</option>
              <option value="baja">De baja</option>
            </select>
          </Campo>
          <div className="sm:col-span-4">
            <button className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              Aplicar filtros
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          titulo="Descargar"
          extra={<span className="text-xs text-slate-500">{describirFiltros(filtros)}</span>}
        />
        <div className="space-y-4 p-4">
          <p className="text-sm text-slate-600">
            La selección actual incluye <strong className="tabular-nums">{count ?? 0}</strong> choferes.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Salida
              titulo="Planilla de choferes"
              detalle="Cédula, vehículo, asignación, estado de caja y columna de firma."
              xlsx={`/api/exportar/xlsx?${comoQuery(filtros as Record<string, string | null>, { tipo: "planilla" })}`}
              imprimir={`/exportar/planilla?${qs}`}
            />
            <Salida
              titulo="Estado de caja"
              detalle="Contrato, vale, anticipo y pago final por chofer. Sin montos (D-16)."
              xlsx={`/api/exportar/xlsx?${comoQuery(filtros as Record<string, string | null>, { tipo: "caja" })}`}
            />
            <Salida
              titulo="Control de folios"
              detalle="Series emitidas con disponibles, usados y anulados."
              xlsx="/api/exportar/xlsx?tipo=folios"
            />
          </div>

          <p className="text-xs text-slate-500">
            Cada descarga queda registrada con tu usuario, la fecha y los filtros usados.
            Sin el permiso <code>datos.exportar_pii</code> las cédulas salen enmascaradas y el
            teléfono no sale. Límite: {LIMITE_EXPORTACIONES} archivos cada {VENTANA_MINUTOS} minutos.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader titulo="Últimas exportaciones" />
        {(recientes ?? []).length === 0 ? (
          <Vacio mensaje="Todavía no se exportó nada." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Formato</th>
                <th className="px-4 py-2 font-medium text-right">Filas</th>
                <th className="px-4 py-2 font-medium">Datos personales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(recientes ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-slate-600">{formatearFecha(e.created_at)}</td>
                  <td className="px-4 py-2">{e.tipo}</td>
                  <td className="px-4 py-2 uppercase text-slate-500">{e.formato}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.filas}</td>
                  <td className="px-4 py-2">
                    {e.incluye_pii
                      ? <Badge tono="alerta">Cédulas completas</Badge>
                      : <Badge>Enmascaradas</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Salida({ titulo, detalle, xlsx, imprimir }: {
  titulo: string; detalle: string; xlsx: string; imprimir?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
      <p className="mt-1 text-xs text-slate-500">{detalle}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={xlsx}
           className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
          XLSX
        </a>
        {imprimir && (
          <Link href={imprimir} target="_blank"
                className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
            Vista de impresión
          </Link>
        )}
      </div>
    </div>
  );
}
