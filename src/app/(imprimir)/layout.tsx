import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Layout de impresión: sin cabecera, sin navegación, sin nada que gaste
 * tinta. La autenticación se verifica igual — una planilla con 600 cédulas
 * no se sirve por ser "sólo una vista de impresión".
 */
export default async function ImprimirLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <div className="bg-white">{children}</div>;
}
