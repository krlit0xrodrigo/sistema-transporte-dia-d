import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components y Server Actions.
 *
 * Propaga el JWT del usuario, así que TODA consulta pasa por RLS. Es el
 * ADR-01: el frontend oculta, la base prohíbe. Acá nunca se usa la
 * service_role key.
 */
export async function crearClienteServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (galletas: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            galletas.forEach(({ name, value, options }) =>
              almacen.set(name, value, options),
            );
          } catch {
            // Server Component: el refresco de sesión lo hace el middleware.
          }
        },
      },
    },
  );
}
