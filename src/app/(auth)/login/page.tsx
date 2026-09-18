import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Aviso } from "@/components/shared";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default async function Login({
  searchParams,
}: { searchParams: Promise<{ error?: string; volver?: string }> }) {
  const sp = await searchParams;

  async function entrar(formData: FormData) {
    "use server";
    const supabase = await crearClienteServidor();
    const rawUsername = String(formData.get("username") ?? "").trim();
    const authEmail = rawUsername.includes("@") ? rawUsername : `${rawUsername}@dia-d.local`;

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: String(formData.get("password") ?? ""),
    });
    // No se distingue "usuario inexistente" de "contraseña incorrecta":
    // hacerlo permite enumerar cuentas.
    if (error) redirect("/login?error=1");
    redirect(String(formData.get("volver") || "/"));
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_28rem]">
      {/* Panel izquierdo — solo en desktop */}
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <img 
          src="/marca/candidato.jpg" 
          alt="Candidato" 
          className="absolute inset-0 h-full w-full object-contain object-center p-8"
        />
        {/* Sombra sutil oscura solo en la parte de abajo para que el texto resalte, sin teñir la foto de rojo */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        
        <div className="relative flex h-full flex-col justify-end p-12 pb-16">
          <h2 className="text-4xl font-bold text-white drop-shadow-md">
            Logística Día D
          </h2>
          <p className="mt-3 text-lg font-medium text-white/90 drop-shadow-md">
            Sistema de Gestión de Transporte
          </p>
          
          <div className="mt-8 h-1 w-20 rounded-full bg-primary" />
          
          <p className="mt-8 text-base text-white/80">
            Villa Hayes · Presidente Hayes
          </p>
          <p className="mt-1 text-sm text-white/60">
            Domingo 4 de octubre de 2026
          </p>
        </div>
      </div>

      {/* Formulario de login */}
      <div className="flex flex-col justify-center bg-background px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">


          <div className="flex items-center gap-12 sm:gap-16 mb-8">
            <img src="/marca/anr.png" alt="ANR" className="h-10 sm:h-12 w-auto object-contain" />
            <img src="/marca/mbarete.png" alt="Mbarete" className="h-10 sm:h-12 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Logística Día D
              </h1>
              <p className="text-sm text-muted-foreground">
                Villa Hayes · 4 de octubre de 2026
              </p>
            </div>
          </div>

          <div className="mt-4 h-1 w-14 rounded bg-primary" />

          <form action={entrar} className="mt-8 space-y-5">
            <input type="hidden" name="volver" value={sp.volver ?? "/"} />

            <div className="space-y-2">
              <Label htmlFor="username">
                Usuario <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                autoFocus
                placeholder="ej. admin"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Contraseña <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            {sp.error && (
              <Aviso tono="error">Usuario o contraseña incorrectos.</Aviso>
            )}

            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>

          <p className="mt-8 text-xs font-bold text-black dark:text-white text-center">
            Sistema de Gestión de Transporte · Equipo Mbarete | Lista 1 · Uso Interno
          </p>
        </div>
      </div>
    </main>
  );
}
