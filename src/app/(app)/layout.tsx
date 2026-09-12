import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { LogoAnr, LogoMbarete } from "@/components/marca";
import { NavPrincipal } from "@/components/nav";

/**
 * Las secciones se filtran por permiso. Un rol `consulta` no debería ver
 * pestañas que va a rebotar contra RLS: esconderlas no es la seguridad
 * —esa vive en la base— pero sí es la diferencia entre una herramienta
 * usable y un campo minado de errores.
 */
const SECCIONES = [
  { href: "/", texto: "Tablero", permiso: null },
  { href: "/choferes", texto: "Choferes", permiso: "choferes.ver" },
  { href: "/caja", texto: "Caja", permiso: "caja.ver" },
  { href: "/ordenes", texto: "Órdenes", permiso: "folios.ver" },
  { href: "/lista-negra", texto: "Lista negra", permiso: "lista_negra.ver" },
  { href: "/cupos", texto: "Cupos", permiso: "cupos.ver" },
  { href: "/gps", texto: "GPS", permiso: "gps.ver" },
  { href: "/reportes", texto: "Reportes", permiso: "reportes.ver" },
  { href: "/exportar", texto: "Exportar", permiso: "datos.exportar" },
  { href: "/usuarios", texto: "Usuarios", permiso: "admin.usuarios" },
];

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

  const visibles = SECCIONES.filter((s) => !s.permiso || concedidos.has(s.permiso));
  const soloLectura = !concedidos.has("choferes.crear") && !concedidos.has("caja.ver");

  async function salir() {
    "use server";
    const s = await crearClienteServidor();
    await s.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b-[3px] border-rojo bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-5">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <LogoMbarete className="h-8 w-auto sm:h-9" />
            <span className="hidden text-sm font-semibold leading-tight tracking-tight text-tinta lg:block">
              Logística Día D
              <span className="block text-[11px] font-normal text-tinta-tenue">Villa Hayes</span>
            </span>
          </Link>

          <NavPrincipal secciones={visibles} />

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <LogoAnr className="hidden h-7 w-auto xl:block" />
            <div className="hidden text-right sm:block">
              <p className="max-w-[12rem] truncate text-xs font-medium text-tinta">
                {perfil?.nombre_completo ?? user.email}
              </p>
              {soloLectura && <p className="text-[11px] text-tinta-tenue">Solo lectura</p>}
            </div>
            <form action={salir}>
              <button className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-tinta-suave transition-colors hover:bg-zinc-100 hover:text-rojo-700">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-borde bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="text-xs text-tinta-tenue">
            Día D · domingo 4 de octubre de 2026 · Villa Hayes, Presidente Hayes
          </p>
          <LogoAnr className="h-6 w-auto opacity-80" />
        </div>
      </footer>
    </div>
  );
}
