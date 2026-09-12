import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/auth"];

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (galletas: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          galletas.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          galletas.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida contra el servidor. getSession() lee la cookie y se
  // puede falsificar: no sirve para decidir acceso.
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;

  if (!user && !PUBLICAS.some((p) => ruta.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("volver", ruta);
    return NextResponse.redirect(url);
  }
  if (user && ruta === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return respuesta;
}
