"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación principal.
 *
 * Es una tira que se desplaza en horizontal en lugar de un menú hamburguesa.
 * El operativo se maneja mucho desde el celular y con apuro: un menú que hay
 * que abrir para ver dónde estás cuesta un toque más en cada navegación, y
 * acá la pestaña activa es información —le dice al operador en qué pantalla
 * está parado cuando levanta la vista del papel.
 */
export function NavPrincipal({
  secciones,
}: { secciones: { href: string; texto: string }[] }) {
  const ruta = usePathname();

  const activa = (href: string) =>
    href === "/" ? ruta === "/" : ruta === href || ruta.startsWith(href + "/");

  return (
    <nav aria-label="Secciones"
         className="-mx-1 flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {secciones.map((s) => {
        const esta = activa(s.href);
        return (
          <Link key={s.href} href={s.href}
            aria-current={esta ? "page" : undefined}
            className={[
              "relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors",
              esta
                ? "font-semibold text-rojo-700 after:absolute after:inset-x-2.5 after:-bottom-[11px] after:h-[3px] after:rounded-t after:bg-rojo after:content-['']"
                : "text-tinta-suave hover:bg-zinc-100 hover:text-tinta",
            ].join(" ")}>
            {s.texto}
          </Link>
        );
      })}
    </nav>
  );
}
