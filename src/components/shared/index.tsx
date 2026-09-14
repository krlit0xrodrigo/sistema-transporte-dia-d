/**
 * Componentes de dominio compartidos.
 *
 * Estos no son shadcn/ui — son componentes específicos del operativo que
 * se usan en varias pantallas. Usan los tokens de shadcn/ui internamente.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Estado vacío — cuando un listado o sección no tiene datos. */
export function Vacio({ mensaje, detalle, accion }: {
  mensaje: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{mensaje}</p>
      {detalle && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{detalle}</p>}
      {accion && <div className="mt-5 flex justify-center">{accion}</div>}
    </div>
  );
}

/** Par etiqueta/valor para fichas de detalle. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Enlace con estilo de la marca. */
export function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {children}
    </Link>
  );
}

/** Aviso/Alert con semántica visual. */
export function Aviso({ tono = "alerta", children }: {
  tono?: "alerta" | "error" | "ok" | "info";
  children: ReactNode;
}) {
  const estilos = {
    alerta: "border-warning/30 bg-warning-50 text-warning",
    error: "border-danger/30 bg-danger-50 text-danger",
    ok: "border-success/30 bg-success-50 text-success",
    info: "border-info/30 bg-info-50 text-info",
  }[tono];

  return (
    <div
      role={tono === "error" ? "alert" : undefined}
      className={cn("rounded-lg border px-4 py-3 text-sm", estilos)}
    >
      {children}
    </div>
  );
}

/** Encabezado de página con título, descripción y acción. */
export function PageHeader({ children, descripcion, accion }: {
  children: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
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
