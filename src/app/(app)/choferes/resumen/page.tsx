import { crearClienteServidor } from "@/lib/supabase/server";
import { ResumenClient } from "./resumen-client";
import { PageHeader } from "@/components/shared";
import { BarChart3 } from "lucide-react";

export const metadata = {
  title: "Resumen de Choferes",
};

export default async function ResumenChoferesPage() {
  const supabase = await crearClienteServidor();

  // Obtenemos los choferes activos de la elección actual a través de la vista v_caja
  const { data, error } = await supabase
    .from("v_caja")
    .select("candidato, supervisor, barrio, vehiculo_categoria, estado_servicio");

  if (error) {
    console.error("Error al cargar resumen:", error);
  }

  const choferes = data || [];

  // Obtenemos las estructuras activas
  const [candRes, supRes, barRes] = await Promise.all([
    supabase.from("candidatos").select("nombre_publico").eq("activo", true),
    supabase.from("supervisores").select("alias").eq("activo", true),
    supabase.from("barrios").select("nombre").eq("activo", true),
  ]);

  const activeEstructura = {
    candidatos: candRes.data?.map((c: any) => c.nombre_publico) || [],
    supervisores: supRes.data?.map((s: any) => s.alias) || [],
    barrios: barRes.data?.map((b: any) => b.nombre) || [],
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <PageHeader descripcion="Desglose de choferes asignados por candidato, supervisor y barrio.">
        Resumen de Estructura
      </PageHeader>
      <ResumenClient choferes={choferes} activeEstructura={activeEstructura} />
    </div>
  );
}
