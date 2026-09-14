import { crearClienteServidor } from "@/lib/supabase/server";
import { AnticiposUI } from "./anticipos-ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anticipos" };

export default async function AnticiposPage() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_caja")
    .select("*")
    .order("nombre_completo");

  if (error) {
    return <div className="p-8 text-rose-600">Error al cargar datos: {error.message}</div>;
  }

  return <AnticiposUI choferes={data || []} />;
}
