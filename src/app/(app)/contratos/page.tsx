import { crearClienteServidor } from "@/lib/supabase/server";
import { ContratosUI } from "./contratos-ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContratosPage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_caja")
    .select("*")
    .order("nombre_completo");

  if (error) {
    return <div className="p-8 text-rose-600">Error al cargar datos: {error.message}</div>;
  }

  return <ContratosUI choferes={data || []} />;
}
