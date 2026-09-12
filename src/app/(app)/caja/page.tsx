import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Vacio, claseInput } from "@/components/ui";
import { formatearCI } from "@/lib/format";
import {
  autorizarPago, entregarVale, firmarContrato, marcarPagoFinal, pagarAnticipo,
} from "@/lib/acciones";

interface FilaCaja {
  chofer_id: string; ci: string; nombre_completo: string; candidato: string | null;
  contrato_firmado: boolean; vale_entregado: boolean; anticipo_pagado: boolean;
  pago_finalizado: boolean; autorizado_por: string | null; actividad: string | null;
}

const ETAPAS = ["pendiente", "contrato", "vale", "anticipo", "pagado"] as const;

function etapa(f: FilaCaja) {
  if (f.pago_finalizado) return "pagado";
  if (f.anticipo_pagado) return "anticipo";
  if (f.vale_entregado) return "vale";
  if (f.contrato_firmado) return "contrato";
  return "pendiente";
}

/** Un botón que dispara una acción de servidor sobre un chofer. */
function Accion({
  accion, chofer, texto, deshabilitado, titulo,
}: {
  accion: (fd: FormData) => Promise<unknown>;
  chofer: string; texto: string; deshabilitado?: boolean; titulo?: string;
}) {
  return (
    <form action={accion as (fd: FormData) => void}>
      <input type="hidden" name="chofer_id" value={chofer} />
      <button disabled={deshabilitado} title={titulo}
        className="rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ring-slate-300 enabled:hover:bg-slate-50 disabled:opacity-40">
        {texto}
      </button>
    </form>
  );
}

export default async function Caja({
  searchParams,
}: { searchParams: Promise<{ q?: string; etapa?: string }> }) {
  const sp = await searchParams;
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("v_caja").select("*").limit(200);
  if (sp.q?.trim()) {
    const q = sp.q.trim();
    consulta = /^[0-9.]+$/.test(q)
      ? consulta.eq("ci", q.replace(/\D/g, ""))
      : consulta.ilike("nombre_completo", `%${q}%`);
  }
  const { data, error } = await consulta.order("nombre_completo");
  let filas = (data ?? []) as FilaCaja[];
  if (sp.etapa) filas = filas.filter((f) => etapa(f) === sp.etapa);

  const total = filas.length;
  const conteo = Object.fromEntries(
    ETAPAS.map((e) => [e, filas.filter((f) => etapa(f) === e).length]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Caja</h1>
        <p className="text-sm text-slate-500">
          Cada marca queda con fecha y responsable. Sin contrato firmado no hay vale ni anticipo,
          y quien autoriza un pago no puede marcarlo como pagado.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {ETAPAS.map((e) => (
          <Link key={e} href={`/caja?etapa=${e}`}
            className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-400">
            <p className="text-xl font-semibold tabular-nums">{conteo[e]}</p>
            <p className="text-xs capitalize text-slate-500">{e}</p>
          </Link>
        ))}
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Cédula o nombre" className={claseInput} />
        <button className="rounded-md bg-slate-900 px-4 text-sm font-medium text-white">Buscar</button>
        {sp.etapa && <Link href="/caja" className="self-center text-sm text-slate-500 underline">Ver todos</Link>}
      </form>

      <Card>
        <CardHeader titulo="Choferes" extra={<span className="text-xs text-slate-500">{total}</span>} />
        {error ? (
          <Vacio mensaje={`No se pudo consultar: ${error.message}`} />
        ) : filas.length === 0 ? (
          <Vacio mensaje="Ningún chofer coincide." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Chofer</th>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Vale</th>
                  <th className="px-3 py-2 font-medium">Anticipo</th>
                  <th className="px-3 py-2 font-medium">Pago final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((f) => (
                  <tr key={f.chofer_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/choferes/${f.chofer_id}`} className="font-medium underline underline-offset-4">
                        {f.nombre_completo}
                      </Link>
                      <p className="text-xs tabular-nums text-slate-500">
                        {formatearCI(f.ci)} · {f.candidato ?? "sin candidato"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {f.contrato_firmado
                        ? <Badge tono="ok">Firmado</Badge>
                        : <Accion accion={firmarContrato} chofer={f.chofer_id} texto="Marcar firmado" />}
                    </td>
                    <td className="px-3 py-2">
                      {f.vale_entregado
                        ? <Badge tono="ok">Entregado</Badge>
                        : <Accion accion={entregarVale} chofer={f.chofer_id} texto="Entregar"
                                  deshabilitado={!f.contrato_firmado}
                                  titulo={!f.contrato_firmado ? "Requiere contrato firmado" : undefined} />}
                    </td>
                    <td className="px-3 py-2">
                      {f.anticipo_pagado
                        ? <Badge tono="ok">Pagado</Badge>
                        : <Accion accion={pagarAnticipo} chofer={f.chofer_id} texto="Pagar"
                                  deshabilitado={!f.contrato_firmado}
                                  titulo={!f.contrato_firmado ? "Requiere contrato firmado" : undefined} />}
                    </td>
                    <td className="px-3 py-2">
                      {f.pago_finalizado ? (
                        <Badge tono="ok">Finalizado</Badge>
                      ) : f.autorizado_por ? (
                        <Accion accion={marcarPagoFinal} chofer={f.chofer_id} texto="Marcar pagado" />
                      ) : (
                        <Accion accion={autorizarPago} chofer={f.chofer_id} texto="Autorizar"
                                titulo={f.actividad === "activo"
                                  ? "Autorizar el pago final"
                                  : "Sin actividad: va a pedir una excepción"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Los montos son opcionales (D-16). Mientras estén vacíos, el control es documental:
        quién firmó, quién cobró y con qué folio.
      </p>
    </div>
  );
}
