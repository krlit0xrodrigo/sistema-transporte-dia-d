"use server";

import { crearClienteServidor } from "@/lib/supabase/server";

export async function obtenerCandidatosActivos() {
  const s = await crearClienteServidor();
  const eleccionId = (await s.rpc('auth_eleccion_actual')).data;
  
  if (!eleccionId) return { error: "No hay elección activa." };

  const { data: { user } } = await s.auth.getUser();
  const { data: scopes } = user 
    ? await s.from("usuario_scopes").select("candidato_id").eq("usuario_id", user.id).eq("tipo", "candidato")
    : { data: [] };
  const misCandidatos = scopes?.map(scope => scope.candidato_id).filter(Boolean) || [];

  let query = s
    .from("candidatos")
    .select("id, nombre_publico")
    .eq("eleccion_id", eleccionId)
    .eq("activo", true);

  if (misCandidatos.length > 0) {
    query = query.in("id", misCandidatos);
  }

  const { data, error } = await query.order("nombre_publico");

  if (error) return { error: error.message };
  return { candidatos: data };
}

export async function obtenerChoferesParaPlanilla(candidatoId: string) {
  const s = await crearClienteServidor();
  const eleccionId = (await s.rpc('auth_eleccion_actual')).data;

  // Realizamos una consulta a choferes, uniendo asignaciones, personas, supervisores y barrios.
  // Filtramos por el candidato_id específico en la asignación y eleccion activa.
  // Ordenamos por numero_orden ascendente.
  const { data, error } = await s
    .from("choferes")
    .select(`
      id,
      numero_orden,
      estado,
      personas (
        ci,
        nombres,
        apellidos
      ),
      asignaciones!inner (
        candidato_id,
        supervisores (
          alias
        ),
        barrios (
          nombre
        )
      )
    `)
    .eq("eleccion_id", eleccionId)
    .eq("asignaciones.candidato_id", candidatoId)
    .not("numero_orden", "is", null)
    .neq("estado", "baja")
    .order("numero_orden", { ascending: true });

  if (error) {
    console.error("Error obteniendo choferes para planilla:", error);
    return { error: error.message };
  }

  // Mapeamos los datos a un formato plano para la vista
  const choferes = data.map((c: any) => ({
    id: c.id,
    nro_orden: c.numero_orden,
    ci: c.personas?.ci || "",
    nombre_completo: `${c.personas?.nombres || ""} ${c.personas?.apellidos || ""}`.trim(),
    estado: c.estado,
    // Extraemos supervisor y barrio del array de asignaciones (solo debería haber uno activo por chofer, pero Supabase devuelve un array para foreign keys a menos que se fuerce, en este caso asignaciones es un 1 to Many relation en la DB, pero lógico es 1 a 1 por chofer activo)
    // Actually, asignaciones is an array if we query from choferes, because choferes->asignaciones is 1-to-many.
    supervisor: Array.isArray(c.asignaciones) 
      ? c.asignaciones[0]?.supervisores?.alias 
      : c.asignaciones?.supervisores?.alias,
    barrio: Array.isArray(c.asignaciones)
      ? c.asignaciones[0]?.barrios?.nombre
      : c.asignaciones?.barrios?.nombre
  }));

  return { choferes };
}
