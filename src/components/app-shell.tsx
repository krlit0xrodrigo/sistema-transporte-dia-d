"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { createBrowserClient } from "@supabase/ssr";

interface AppShellProps {
  permisos: string[];
  usuario: { nombre: string; email: string; soloLectura: boolean };
  children: React.ReactNode;
}

/**
 * App Shell: sidebar (desktop) + header con mobile toggle + main content.
 *
 * Recibe los permisos como array (serializable desde el server component)
 * y los convierte en Set para el sidebar.
 */
export function AppShell({ permisos, usuario, children }: AppShellProps) {
  const router = useRouter();
  const permisosSet = React.useMemo(() => new Set(permisos), [permisos]);

  const handleSignOut = React.useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <AppSidebar
        permisos={permisosSet}
        usuario={usuario}
        onSignOut={handleSignOut}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden" data-no-print>
          <MobileSidebar
            permisos={permisosSet}
            usuario={usuario}
            onSignOut={handleSignOut}
          />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-xs font-bold">D</span>
            </div>
            <span className="text-sm font-semibold">Día D</span>
          </div>
          <div className="ml-auto text-right">
            <p className="max-w-[10rem] truncate text-xs font-medium">{usuario.nombre}</p>
            {usuario.soloLectura && (
              <p className="text-[10px] text-muted-foreground">Solo lectura</p>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t bg-background px-4 py-3" data-no-print>
          <p className="text-center text-[11px] text-muted-foreground">
            Día D · domingo 4 de octubre de 2026 · Villa Hayes, Presidente Hayes
          </p>
        </footer>
      </div>
    </div>
  );
}
