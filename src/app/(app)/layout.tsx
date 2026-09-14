import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

/**
 * Layout autenticado principal.
 *
 * Usa getUser() contra el servidor (no getSession() que se puede falsificar).
 * Los permisos se cargan una sola vez y se pasan al AppShell.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Un solo viaje para el perfil y los permisos: el layout se renderiza en
  // cada navegación y dos consultas secuenciales acá se pagan en todas las
  // pantallas.
  const [{ data: perfil }, { data: permisos }] = await Promise.all([
    supabase.from("usuarios").select("nombre_completo, email").eq("id", user.id).maybeSingle(),
    supabase.from("usuario_roles").select("roles(rol_permisos(permisos(codigo)))").eq("usuario_id", user.id),
  ]);

  type FilaRol = { roles: { rol_permisos: { permisos: { codigo: string } | null }[] } | null };
  const concedidos = new Set<string>();
  for (const fila of (permisos ?? []) as unknown as FilaRol[]) {
    for (const rp of fila.roles?.rol_permisos ?? []) {
      if (rp.permisos?.codigo) concedidos.add(rp.permisos.codigo);
    }
  }

  const soloLectura = !concedidos.has("choferes.crear") && !concedidos.has("caja.ver");

  return (
    <AppShell
      permisos={Array.from(concedidos)}
      usuario={{
        nombre: perfil?.nombre_completo ?? user.email ?? "Usuario",
        email: perfil?.email ?? user.email ?? "",
        soloLectura,
      }}
    >
      {children}
    </AppShell>
  );
}
