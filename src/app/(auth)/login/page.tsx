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
      {/* Panel izquierdo — solo en desktop */}
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="flex h-full flex-col items-center justify-center p-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <span className="text-4xl font-bold text-white">D</span>
          </div>
          <h2 className="mt-6 text-center text-2xl font-bold text-white">
            Logística Día D
          </h2>
          <p className="mt-2 text-center text-sm text-white/80">
            Sistema de Gestión de Transporte
          </p>
          <p className="mt-1 text-center text-sm text-white/60">
            Villa Hayes · Presidente Hayes
          </p>
          <div className="mt-8 h-1 w-16 rounded-full bg-white/30" />
          <p className="mt-8 text-center text-xs text-white/50">
            Domingo 4 de octubre de 2026
          </p>
        </div>
      </div>

      {/* Formulario de login */}
      <div className="flex flex-col justify-center bg-background px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <span className="text-lg font-bold">D</span>
            </div>
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
              <Label htmlFor="email">
                Correo <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                autoFocus
                placeholder="usuario@ejemplo.com"
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
              <Aviso tono="error">Correo o contraseña incorrectos.</Aviso>
            )}

            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Sistema interno del operativo. Maneja datos personales de personas reales:
            todo acceso y toda exportación quedan registrados con tu usuario.
          </p>
        </div>
      </div>
    </main>
  );
}
