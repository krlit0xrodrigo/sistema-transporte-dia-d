import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Aviso, Boton, Campo, claseInput } from "@/components/ui";
import { AficheCandidato, LogoAnr, LogoMbarete } from "@/components/marca";

export default async function Login({
  searchParams,
}: { searchParams: Promise<{ error?: string; volver?: string }> }) {
  const sp = await searchParams;

  async function entrar(formData: FormData) {
    "use server";
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    // No se distingue "usuario inexistente" de "contraseña incorrecta":
    // hacerlo permite enumerar cuentas.
    if (error) redirect("/login?error=1");
    redirect(String(formData.get("volver") || "/"));
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_28rem]">
      {/* El afiche sólo en pantallas anchas: en un celular robaría la
          pantalla al formulario, que es a lo que se viene. */}
      <div className="relative hidden overflow-hidden bg-rojo lg:block">
        <AficheCandidato className="h-full w-full object-cover object-top" />
      </div>

      <div className="flex flex-col justify-center bg-white px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <LogoMbarete className="h-12 w-auto" />

          <h1 className="mt-7 text-2xl font-semibold tracking-tight text-tinta">
            Logística Día D
          </h1>
          <p className="mt-1.5 text-sm text-tinta-suave">
            Villa Hayes · domingo 4 de octubre de 2026
          </p>
          <div className="mt-4 h-1 w-14 rounded bg-rojo" />

          <form action={entrar} className="mt-8 space-y-5">
            <input type="hidden" name="volver" value={sp.volver ?? "/"} />
            <Campo etiqueta="Correo" nombre="email" requerido>
              <input id="email" name="email" type="email" required autoComplete="email"
                     inputMode="email" autoFocus className={claseInput} />
            </Campo>
            <Campo etiqueta="Contraseña" nombre="password" requerido>
              <input id="password" name="password" type="password" required
                     autoComplete="current-password" className={claseInput} />
            </Campo>

            {sp.error && <Aviso tono="error">Correo o contraseña incorrectos.</Aviso>}

            <Boton type="submit" className="w-full">Entrar</Boton>
          </form>

          <p className="mt-8 text-xs leading-relaxed text-tinta-tenue">
            Sistema interno del operativo. Maneja datos personales de personas reales:
            todo acceso y toda exportación quedan registrados con tu usuario.
          </p>

          <div className="mt-8 border-t border-borde pt-6">
            <LogoAnr className="h-7 w-auto" />
          </div>
        </div>
      </div>
    </main>
  );
}
