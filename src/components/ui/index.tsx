/**
 * Capa de compatibilidad.
 *
 * Las páginas de la v1 importan desde `@/components/ui`. Este archivo
 * re-exporta los componentes del viejo ui/index.tsx que aún se usan,
 * adaptados a los tokens nuevos. Se irá eliminando a medida que cada
 * página se reconstruya con los componentes shadcn/ui en su fase.
 *
 * @deprecated Importar de `@/components/ui/button`, `@/components/ui/card`, etc.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ─── Re-exports de componentes shadcn/ui ─── */
// NOTA: Badge y CardHeader NO se re-exportan desde shadcn porque las páginas
// v1 usan la API vieja (tono, titulo). Las versiones legacy están abajo.
// Importar directamente de @/components/ui/badge, @/components/ui/card para shadcn.
export { Button } from "./button";
export { Card, CardTitle, CardDescription, CardContent, CardFooter } from "./card";
export { Input } from "./input";
export { Label } from "./label";
export { Separator } from "./separator";
export { Skeleton } from "./skeleton";

/* ─── Componentes legado (se eliminan cuando se migre la página) ─── */

type Tono = "neutro" | "ok" | "alerta" | "error" | "info" | "marca";
const TONOS: Record<Tono, string> = {
  neutro: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  alerta: "bg-amber-50 text-amber-900 ring-amber-200",
  error: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  marca: "bg-primary text-white ring-primary",
};

/** @deprecated Usar Badge de @/components/ui/badge */
export function Badge({ children, tono = "neutro" }: { children: ReactNode; tono?: Tono }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
      TONOS[tono])}>
      {children}
    </span>
  );
}

/** @deprecated Usar CardHeader de @/components/ui/card */
export function CardHeader({ titulo, extra, descripcion }: {
  titulo: string; extra?: ReactNode; descripcion?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>}
      </div>
      {extra}
    </div>
  );
}

const ESTILOS_BOTON = {
  primario: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secundario: "bg-background text-foreground ring-1 ring-inset ring-border hover:bg-accent",
  peligro: "bg-background text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive/10",
  fantasma: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
} as const;

/** @deprecated Usar Button de shadcn/ui */
export function Boton({
  children, tipo = "primario", type = "button", className, ...props
}: {
  children: ReactNode; tipo?: keyof typeof ESTILOS_BOTON;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        ESTILOS_BOTON[tipo], className)}>
      {children}
    </button>
  );
}

/** @deprecated Usar Button asChild con Link */
export function BotonEnlace({
  href, children, tipo = "primario", target,
}: { href: string; children: ReactNode; tipo?: keyof typeof ESTILOS_BOTON; target?: string }) {
  return (
    <Link href={href} target={target}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        ESTILOS_BOTON[tipo])}>
      {children}
    </Link>
  );
}

/** @deprecated Usar Label + Input de shadcn/ui */
export function Campo({
  etiqueta, nombre, requerido, ayuda, children,
}: { etiqueta: string; nombre: string; requerido?: boolean; ayuda?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={nombre} className="block text-sm font-medium">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
        {requerido && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

/** @deprecated Usar Input de shadcn/ui */
export const claseInput =
  "block w-full rounded-lg border-0 bg-background px-3 py-2 text-sm " +
  "ring-1 ring-inset ring-border placeholder:text-muted-foreground " +
  "focus:ring-2 focus:ring-inset focus:ring-ring";

/** @deprecated Usar Vacio de @/components/shared */
export function Vacio({ mensaje, detalle, accion }: {
  mensaje: string; detalle?: string; accion?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-medium">{mensaje}</p>
      {detalle && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{detalle}</p>}
      {accion && <div className="mt-5 flex justify-center">{accion}</div>}
    </div>
  );
}

/** @deprecated Usar Dato de @/components/shared */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** @deprecated Usar Enlace de @/components/shared */
export function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href}
      className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80">
      {children}
    </Link>
  );
}

/** @deprecated Usar Table de shadcn/ui (futuro) */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">{children}</table>
    </div>
  );
}

/** @deprecated */
export function Th({ children, numerico }: { children: ReactNode; numerico?: boolean }) {
  return (
    <th scope="col" className={cn(
      "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
      numerico ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

/** @deprecated Usar Aviso de @/components/shared */
export function Aviso({ tono = "alerta", children }: { tono?: "alerta" | "error" | "ok" | "info"; children: ReactNode }) {
  const estilos = {
    alerta: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  }[tono];
  return (
    <div role={tono === "error" ? "alert" : undefined}
         className={cn("rounded-lg border px-4 py-3 text-sm", estilos)}>
      {children}
    </div>
  );
}

/** @deprecated Usar PageHeader de @/components/shared */
export function Titulo({ children, descripcion, accion }: {
  children: ReactNode; descripcion?: ReactNode; accion?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
        {descripcion && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
export * from "./data-table";
export { Paginacion } from "./pagination";
