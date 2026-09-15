import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared";
import { FormAlta } from "./form-alta";
import { ImportarSheets } from "./importar-sheets";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import type { ResultadoPadron } from "@/types/database";

export const metadata: Metadata = {
  title: "Alta de chofer",
};

/**
 * PUERTA 2 — Alta de chofer.
 *
 * Server component que carga los catálogos y verifica el padrón si hay
 * CI precargada. El formulario vive en un client component con React
 * Hook Form + Zod.
 *
 * La cadena de validaciones pesadas (lista negra, duplicado, cupo)
 * vive en fn_alta_chofer — una sola transacción en la base.
 */
export default async function AltaPage({
  searchParams,
}: { searchParams: Promise<{ ci?: string }> }) {
  const sp = await searchParams;
  const ciPrecargada = (sp.ci ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");

  const supabase = await crearClienteServidor();

  // Cargar catálogos y verificar padrón en paralelo
  const [
    { data: candidatos },
    { data: barrios },
    { data: supervisores },
    padronResult,
  ] = await Promise.all([
    supabase.from("candidatos").select("id, nombre_publico").eq("activo", true).order("nombre_publico"),
    supabase.from("barrios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("supervisores").select("id, alias").eq("activo", true).order("alias"),
    ciPrecargada
      ? supabase.rpc("fn_verificar_padron", { p_ci: ciPrecargada })
      : Promise.resolve({ data: null }),
  ]);

  const padronRaw = padronResult.data;
  const padron = ciPrecargada
    ? ((Array.isArray(padronRaw) ? padronRaw[0] : padronRaw) as ResultadoPadron | null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/choferes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Choferes
        </Link>
        <PageHeader descripcion="La cédula se verifica contra el padrón y contra la lista negra antes de crear.">
          Alta de chofer
        </PageHeader>
      </div>

      <FormAlta
        ciPrecargada={ciPrecargada}
        candidatos={(candidatos ?? []).map((c) => ({
          id: c.id,
          nombre: c.nombre_publico,
        }))}
        barrios={(barrios ?? []).map((b) => ({
          id: b.id,
          nombre: b.nombre,
        }))}
        supervisores={(supervisores ?? []).map((s) => ({
          id: s.id,
          nombre: s.alias,
        }))}
        padron={padron ? {
          encontrado: padron.encontrado,
          nombre_completo: padron.nombre_completo,
        } : null}
      />

      <ImportarSheets />
    </div>
  );
}
