import { crearClienteServidor } from "@/lib/supabase/server";
import { PagosUI } from "./pagos-ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pagos Finales" };

export default async function PagosPage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_caja")
    .select("*")
    .order("nombre_completo");

  if (error) {
    return <div className="p-8 text-rose-600">Error al cargar datos: {error.message}</div>;
  }

  return <PagosUI choferes={data || []} />;
}
