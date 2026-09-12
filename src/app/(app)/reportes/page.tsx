import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Vacio } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Reportes del operativo.
 *
 * La agregación se hace acá y no en SQL a propósito: son ~600 filas y la
 * vista `v_choferes_ficha` es `security_invoker`, así que cada usuario
 * agrega sobre lo que puede ver. Una vista materializada con totales
 * globales filtraría mal para un supervisor y habría que reescribirla con
 * los mismos scopes. Con este volumen no hace falta.
 */

interface Fila {
  candidato: string | null;
  barrio: string | null;
  responsable: string | null;
  responsable_tipo: string | null;
  estado_identidad: string;
  estado_servicio: string;
  contrato_firmado: boolean | null;
  vale_entregado: boolean | null;
  anticipo_pagado: boolean | null;
  pago_finalizado: boolean | null;
  actividad: string | null;
}

interface Acumulado {
  clave: string;
  total: number;
  contrato: number;
  vale: number;
  anticipo: number;
  pago: number;
  verificados: number;
  activos_gps: number;
}

function agrupar(filas: Fila[], por: (f: Fila) => string): Acumulado[] {
  const mapa = new Map<string, Acumulado>();
  for (const f of filas) {
    const clave = por(f);
    let a = mapa.get(clave);
    if (!a) {
      a = { clave, total: 0, contrato: 0, vale: 0, anticipo: 0, pago: 0, verificados: 0, activos_gps: 0 };
      mapa.set(clave, a);
    }
    a.total++;
    if (f.contrato_firmado) a.contrato++;
    if (f.vale_entregado) a.vale++;
    if (f.anticipo_pagado) a.anticipo++;
    if (f.pago_finalizado) a.pago++;
    if (f.estado_identidad === "verificada") a.verificados++;
    if (f.actividad === "activo") a.activos_gps++;
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

function pct(parte: number, total: number) {
  return total === 0 ? 0 : Math.round((100 * parte) / total);
}

function Barra({ parte, total }: { parte: number; total: number }) {
  const p = pct(parte, total);
  const color = p >= 90 ? "bg-emerald-500" : p >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-16 text-xs tabular-nums text-slate-600">{parte} · {p}%</span>
    </div>
  );
}

function TablaAvance({ titulo, datos, encabezado, vacio }: {
  titulo: string; datos: Acumulado[]; encabezado: string; vacio: string;
}) {
  return (
    <Card>
      <CardHeader titulo={titulo} />
      {datos.length === 0 ? <Vacio mensaje={vacio} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">{encabezado}</th>
                <th className="px-4 py-2 text-right font-medium">Choferes</th>
                <th className="px-4 py-2 font-medium">Contrato</th>
                <th className="px-4 py-2 font-medium">Vale</th>
                <th className="px-4 py-2 font-medium">Anticipo</th>
                <th className="px-4 py-2 font-medium">Pago final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.map((d) => (
                <tr key={d.clave}>
                  <td className="px-4 py-2 font-medium text-slate-800">{d.clave}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.total}</td>
                  <td className="px-4 py-2"><Barra parte={d.contrato} total={d.total} /></td>
                  <td className="px-4 py-2"><Barra parte={d.vale} total={d.total} /></td>
                  <td className="px-4 py-2"><Barra parte={d.anticipo} total={d.total} /></td>
                  <td className="px-4 py-2"><Barra parte={d.pago} total={d.total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function Reportes() {
  const supabase = await crearClienteServidor();

  const [{ data: choferes }, { data: series }, { data: negra }] = await Promise.all([
    supabase.from("v_choferes_ficha")
      .select("candidato, barrio, responsable, responsable_tipo, estado_identidad, estado_servicio, contrato_firmado, vale_entregado, anticipo_pagado, pago_finalizado, actividad")
      .eq("estado", "activo").limit(5000),
    supabase.from("v_folios_series")
      .select("id, tipo_documento, prefijo, desde, hasta, estado, total, disponibles, usados, anulados")
      .order("tipo_documento"),
    supabase.from("v_lista_negra").select("id").eq("vigente", true).limit(1000),
  ]);

  const filas = (choferes ?? []) as unknown as Fila[];
  const total = filas.length;

  const resumen = {
    total,
    contrato: filas.filter((f) => f.contrato_firmado).length,
    vale: filas.filter((f) => f.vale_entregado).length,
    anticipo: filas.filter((f) => f.anticipo_pagado).length,
    pago: filas.filter((f) => f.pago_finalizado).length,
    verificados: filas.filter((f) => f.estado_identidad === "verificada").length,
    fuera: filas.filter((f) => f.estado_identidad === "fuera_de_padron").length,
    sin_asignacion: filas.filter((f) => !f.candidato).length,
    sin_barrio: filas.filter((f) => !f.barrio).length,
    contratados: filas.filter((f) => f.estado_servicio === "contratado").length,
  };

  const porCandidato = agrupar(filas, (f) => f.candidato ?? "Sin candidato asignado");
  const porResponsable = agrupar(filas, (f) => f.responsable ?? "Sin responsable declarado");
  const porBarrio = agrupar(filas, (f) => f.barrio ?? "Sin barrio asignado");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reportes</h1>
          <p className="text-sm text-slate-500">
            Sobre los {total} choferes activos que tu usuario puede ver.
          </p>
        </div>
        <Link href="/exportar" className="text-sm text-slate-600 underline underline-offset-4">
          Exportar
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica valor={total} etiqueta="Choferes activos"
                 detalle={`${resumen.contratados} contratados`} />
        <Metrica valor={`${pct(resumen.contrato, total)}%`} etiqueta="Con contrato firmado"
                 detalle={`${resumen.contrato} de ${total}`} />
        <Metrica valor={`${pct(resumen.pago, total)}%`} etiqueta="Pago final cerrado"
                 detalle={`${resumen.pago} de ${total}`} />
        <Metrica valor={(negra ?? []).length} etiqueta="En lista negra vigente"
                 detalle="Bloquean el alta" />
      </div>

      <Card>
        <CardHeader titulo="Resumen del operativo" />
        <dl className="grid gap-px bg-slate-100 sm:grid-cols-3">
          <Renglon etiqueta="Verificados en el padrón" valor={`${resumen.verificados} (${pct(resumen.verificados, total)}%)`} />
          <Renglon etiqueta="Fuera del padrón de Villa Hayes" valor={String(resumen.fuera)} />
          <Renglon etiqueta="Sin candidato asignado" valor={String(resumen.sin_asignacion)} />
          <Renglon etiqueta="Sin barrio asignado" valor={String(resumen.sin_barrio)} />
          <Renglon etiqueta="Vales entregados" valor={`${resumen.vale} (${pct(resumen.vale, total)}%)`} />
          <Renglon etiqueta="Anticipos pagados" valor={`${resumen.anticipo} (${pct(resumen.anticipo, total)}%)`} />
        </dl>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          La actividad GPS no aparece acá: el job de Traccar se ingiere el Día D y la
          clasificación se calcula el 5 de octubre (ROADMAP §4). Hasta entonces todos los
          choferes están en <code>sin_datos</code> y un porcentaje sería una mentira prolija.
        </p>
      </Card>

      <TablaAvance titulo="Por candidato" datos={porCandidato} encabezado="Candidato"
                   vacio="Ningún chofer tiene candidato asignado todavía." />
      <TablaAvance titulo="Por responsable declarado (RN-16)" datos={porResponsable} encabezado="Responsable"
                   vacio="Sin responsables declarados." />
      <TablaAvance titulo="Por barrio" datos={porBarrio} encabezado="Barrio"
                   vacio="Ningún chofer tiene barrio asignado todavía." />

      <Card>
        <CardHeader
          titulo="Control de folios"
          extra={<Link href="/folios" className="text-xs text-slate-500 underline">Gestionar</Link>}
        />
        {(series ?? []).length === 0 ? (
          <Vacio mensaje="No hay series emitidas. Sin serie, la caja no puede asignar folios." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Documento</th>
                  <th className="px-4 py-2 font-medium">Rango</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Usados</th>
                  <th className="px-4 py-2 text-right font-medium">Anulados</th>
                  <th className="px-4 py-2 text-right font-medium">Disponibles</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(series ?? []).map((s) => {
                  const restante = pct(s.disponibles, s.total);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2">{s.tipo_documento}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">
                        {s.prefijo}{s.desde} – {s.prefijo}{s.hasta}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.total}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.usados}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.anulados}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{s.disponibles}</td>
                      <td className="px-4 py-2">
                        {s.disponibles === 0 ? <Badge tono="error">Agotada</Badge>
                          : restante <= 20 ? <Badge tono="alerta">Quedan {restante}%</Badge>
                          : <Badge tono="ok">Disponible</Badge>}
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

function Metrica({ valor, etiqueta, detalle }: { valor: number | string; etiqueta: string; detalle?: string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-sm text-slate-600">{etiqueta}</p>
      {detalle && <p className="mt-1 text-xs text-slate-400">{detalle}</p>}
    </Card>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-slate-900">{valor}</dd>
    </div>
  );
}
