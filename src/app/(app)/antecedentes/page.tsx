import { crearClienteServidor } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";
import { AntecedentesClient } from "./antecedentes-client";

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
          Error al cargar los antecedentes o no tienes permisos: {JSON.stringify(error)}
        </div>
      )}

      <AntecedentesClient antecedentes={antecedentes} />
    </div>
  );
}
