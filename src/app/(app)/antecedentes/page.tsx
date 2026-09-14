import { crearClienteServidor } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Vacio } from "@/components/ui";
import { formatearCI, formatearFecha } from "@/lib/format";
import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Antecedentes" };

export default async function AntecedentesPage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_antecedentes")
    .select("*")
    .order("eleccion_fecha", { ascending: false });

  const antecedentes = (data ?? []) as any[];

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Historial de participaciones en elecciones anteriores. Estos registros son inmutables y sirven para la toma de decisiones.">
        Antecedentes históricos
      </PageHeader>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Error al cargar los antecedentes o no tienes permisos.
        </div>
      )}

      <Card>
        <CardHeader titulo="Participaciones registradas" extra={<span className="text-xs text-slate-500">{antecedentes.length}</span>} />
        {antecedentes.length === 0 ? (
          <Vacio mensaje="No hay antecedentes históricos registrados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Persona</th>
                  <th className="px-4 py-2 font-medium">Elección</th>
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 font-medium">Resultado</th>
                  <th className="px-4 py-2 font-medium">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {antecedentes.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{a.nombre_completo}</p>
                      <p className="text-xs tabular-nums text-slate-500">{formatearCI(a.ci)}</p>
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-slate-900">{a.eleccion_nombre}</p>
                      <p className="text-xs text-slate-500">{formatearFecha(a.eleccion_fecha)}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-600 capitalize">
                      {a.rol}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tono={
                        a.resultado === "ok" ? "ok" : 
                        a.resultado === "ausente" ? "alerta" : 
                        a.resultado === "incumplimiento" ? "error" : "neutro"
                      }>
                        {a.resultado.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {a.km_recorridos && <p>Km: {a.km_recorridos}</p>}
                      {a.tuvo_gps && <p>GPS: Sí</p>}
                      {a.incidentes && <p className="text-rose-600">Incidentes: {a.incidentes}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
