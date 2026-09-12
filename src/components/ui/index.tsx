import Link from "next/link";
import type { ReactNode } from "react";

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-borde bg-white shadow-tarjeta", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ titulo, extra, descripcion }: {
  titulo: string; extra?: ReactNode; descripcion?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-tinta">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-xs text-tinta-tenue">{descripcion}</p>}
      </div>
      {extra}
    </div>
  );
}

type Tono = "neutro" | "ok" | "alerta" | "error" | "info" | "marca";
const TONOS: Record<Tono, string> = {
  neutro: "bg-zinc-100 text-tinta-suave ring-zinc-200",
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  alerta: "bg-amber-50 text-amber-900 ring-amber-200",
  error: "bg-rojo-50 text-rojo-800 ring-rojo-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  marca: "bg-rojo text-white ring-rojo",
};

export function Badge({ children, tono = "neutro" }: { children: ReactNode; tono?: Tono }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
      TONOS[tono])}>
      {children}
    </span>
  );
}

const ESTILOS_BOTON = {
  primario: "bg-rojo text-white hover:bg-rojo-700 active:bg-rojo-800 shadow-tarjeta",
  secundario: "bg-white text-tinta ring-1 ring-inset ring-borde hover:bg-zinc-50",
  peligro: "bg-white text-rojo-700 ring-1 ring-inset ring-rojo-200 hover:bg-rojo-50",
  fantasma: "text-tinta-suave hover:bg-zinc-100 hover:text-tinta",
} as const;

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

/** Mismo aspecto que Boton, para navegación. */
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

export function Campo({
  etiqueta, nombre, requerido, ayuda, children,
}: { etiqueta: string; nombre: string; requerido?: boolean; ayuda?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={nombre} className="block text-sm font-medium text-tinta">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-rojo" aria-hidden="true">*</span>}
        {requerido && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {children}
      {ayuda && <p className="text-xs text-tinta-tenue">{ayuda}</p>}
    </div>
  );
}

export const claseInput =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-tinta shadow-sm " +
  "ring-1 ring-inset ring-borde placeholder:text-tinta-tenue " +
  "focus:ring-2 focus:ring-inset focus:ring-rojo";

export function Vacio({ mensaje, detalle, accion }: {
  mensaje: string; detalle?: string; accion?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-medium text-tinta">{mensaje}</p>
      {detalle && <p className="mx-auto mt-1.5 max-w-md text-sm text-tinta-tenue">{detalle}</p>}
      {accion && <div className="mt-5 flex justify-center">{accion}</div>}
    </div>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-tinta-tenue">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-tinta">{children}</dd>
    </div>
  );
}

export function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href}
      className="text-sm font-medium text-rojo-700 underline underline-offset-4 hover:text-rojo-800">
      {children}
    </Link>
  );
}

/** Tabla que en móvil hace scroll horizontal controlado, nunca desborda la página. */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, numerico }: { children: ReactNode; numerico?: boolean }) {
  return (
    <th scope="col" className={cn(
      "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-tinta-tenue",
      numerico ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

export function Aviso({ tono = "alerta", children }: { tono?: "alerta" | "error" | "ok" | "info"; children: ReactNode }) {
  const estilos = {
    alerta: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-rojo-200 bg-rojo-50 text-rojo-800",
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

export function Titulo({ children, descripcion, accion }: {
  children: ReactNode; descripcion?: ReactNode; accion?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">{children}</h1>
        {descripcion && <p className="mt-1 max-w-2xl text-sm text-tinta-suave">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
