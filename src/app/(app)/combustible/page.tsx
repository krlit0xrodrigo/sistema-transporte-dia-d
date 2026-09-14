import { crearClienteServidor } from "@/lib/supabase/server";
import { CombustibleUI } from "./combustible-ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Combustible" };

export default async function CombustiblePage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_caja")
    .select("*")
    .order("nombre_completo");

  if (error) {
    return <div className="p-8 text-rose-600">Error al cargar datos: {error.message}</div>;
  }

  return <CombustibleUI choferes={data || []} />;
}
