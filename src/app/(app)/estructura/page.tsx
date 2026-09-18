import { crearClienteServidor } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";
import { EstructuraClient } from "./estructura-client";

export const metadata: Metadata = { title: "Estructura" };

export default async function EstructuraPage() {
  const supabase = await crearClienteServidor();

  // Obtenemos la elección activa
  const { data: eleccion } = await supabase
    .from("elecciones")
    .select("id")
    .eq("estado", "activa")
    .single();

  if (!eleccion) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No hay ninguna elección activa configurada.
      </div>
    );
  }

  // Obtenemos los cupos de la elección activa
  const { data: cupos } = await supabase
    .from("cupos")
    .select("ambito, limite, candidato_id, supervisor_id, barrio_id")
    .eq("eleccion_id", eleccion.id);

  const cuposList = cupos ?? [];
  const mapCuposCandidato = new Map(cuposList.filter(c => c.ambito === "candidato").map(c => [c.candidato_id, c.limite]));
  const mapCuposSupervisor = new Map(cuposList.filter(c => c.ambito === "supervisor").map(c => [c.supervisor_id, c.limite]));
  const mapCuposBarrio = new Map(cuposList.filter(c => c.ambito === "barrio").map(c => [c.barrio_id, c.limite]));

  // Obtenemos candidatos
  const { data: candidatosData } = await supabase
    .from("candidatos")
    .select("id, nombre_publico")
    .eq("eleccion_id", eleccion.id)
    .eq("activo", true)
    .order("nombre_publico");

  const candidatos = (candidatosData ?? []).map(c => ({
    id: c.id,
    nombre: c.nombre_publico,
    cupo: mapCuposCandidato.get(c.id) ?? 0
  }));

  // Obtenemos supervisores
  const { data: supervisoresData } = await supabase
    .from("supervisores")
    .select("id, alias, candidato_id")
    .eq("eleccion_id", eleccion.id)
    .eq("activo", true)
    .order("alias");

  const supervisores = (supervisoresData ?? []).map(s => ({
    id: s.id,
    alias: s.alias,
    candidato_id: s.candidato_id,
    cupo: mapCuposSupervisor.get(s.id) ?? 0
  }));

  // Obtenemos barrios
  const { data: barriosData } = await supabase
    .from("barrios")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

  const barrios = (barriosData ?? []).map(b => ({
    id: b.id,
    nombre: b.nombre,
    cupo: mapCuposBarrio.get(b.id) ?? 0
  }));

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Gestión de Candidatos, Supervisores y asignación de Cupos para la elección activa.">
        Estructura y Cupos
      </PageHeader>
      
      <EstructuraClient
        eleccionId={eleccion.id}
        candidatos={candidatos}
        supervisores={supervisores}
        barrios={barrios}
      />
    </div>
  );
}
