import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alta de chofer",
};

/**
 * Redireccion de /choferes/nuevo → /alta
 * La nueva ruta de alta es /alta (FASE 3).
 */
export default async function NuevoChoferRedirect({
  searchParams,
}: { searchParams: Promise<{ ci?: string }> }) {
  const sp = await searchParams;
  const ci = sp.ci ? `?ci=${encodeURIComponent(sp.ci)}` : "";
  redirect(`/alta${ci}`);
}
