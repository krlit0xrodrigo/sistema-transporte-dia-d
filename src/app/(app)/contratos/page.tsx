import { crearClienteServidor } from "@/lib/supabase/server";
import { ContratosUI } from "./contratos-ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContratosPage() {
  const supabase = await crearClienteServidor();
  const eleccionId = (await supabase.rpc("auth_eleccion_actual")).data;

  const { data, error } = await supabase
    .from("v_caja")
    .select("*")
    .eq("eleccion_id", eleccionId)
    .order("nombre_completo");

  if (error) {
    return <div className="p-8 text-rose-600">Error al cargar datos: {error.message}</div>;
  }

  return <ContratosUI choferes={data || []} />;
}
