import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases de Tailwind resolviendo conflictos correctamente.
 * Se usa en todos los componentes de shadcn/ui y de dominio.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
