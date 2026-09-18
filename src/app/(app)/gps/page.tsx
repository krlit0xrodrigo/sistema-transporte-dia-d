import { crearClienteServidor } from "@/lib/supabase/server";
import { GpsClient } from "./gps-client";

export const dynamic = "force-dynamic";

export default async function GpsPage() {
  const supabase = await crearClienteServidor();
  const supabaseAdmin = await import("@/lib/supabase/server").then(m => m.crearClienteAdmin());

  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRoles } = await supabase
    .from("usuario_roles")
    .select("roles!inner(codigo)")
    .eq("usuario_id", user?.id) as { data: { roles: { codigo: string } }[] | null };
  const roles = userRoles?.map(r => r.roles.codigo) || [];
  const esConsultaPuro = roles.includes("consulta") && !roles.includes("candidato") && !roles.includes("concejal");
  const dbActual = esConsultaPuro ? supabaseAdmin : supabase;

  const { data: eleccionActual } = await supabase.rpc('auth_eleccion_actual');

  if (!eleccionActual) {
    return (
      <div className="p-8 text-center text-rose-500">
        No hay elección activa.
      </div>
    );
  }

  // Traer TODOS los choferes dados de alta para esta elección
  const { data, error } = await dbActual
    .from("choferes")
    .select(`
      id,
      estado,
      personas (
        ci,
        nombres,
        apellidos,
        telefono_e164
      ),
      asignaciones (
        candidatos (nombre_publico),
        supervisores (alias),
        barrios (nombre)
      ),
      dispositivos_gps (
        id,
        traccar_device_id,
        unique_id,
        estado,
        ultimo_contacto
      )
    `)
    .eq("eleccion_id", eleccionActual)
    .eq("estado", "activo")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="p-8 text-center text-rose-500">
        Error al cargar los choferes: {error.message}
      </div>
    );
  }

  // Transformar los datos para la UI
  const choferes = data.map((c: any) => {
    const asig = Array.isArray(c.asignaciones) ? c.asignaciones[0] : c.asignaciones;
    
    // Filtrar los dispositivos activos (puede haber históricos dados de baja, nos importa el activo)
    const dispositivos = Array.isArray(c.dispositivos_gps) ? c.dispositivos_gps : [c.dispositivos_gps].filter(Boolean);
    const dispositivoActivo = dispositivos.find((d: any) => d && d.estado !== 'baja');

    return {
      id: c.id,
      ci: c.personas?.ci || "",
      nombre_completo: `${c.personas?.nombres || ""} ${c.personas?.apellidos || ""}`.trim(),
      telefono: c.personas?.telefono_e164,
      candidato: asig?.candidatos?.nombre_publico || null,
      supervisor: asig?.supervisores?.alias || null,
      barrio: asig?.barrios?.nombre || null,
      dispositivo: dispositivoActivo ? {
        id: dispositivoActivo.id,
        traccar_device_id: dispositivoActivo.traccar_device_id,
        unique_id: dispositivoActivo.unique_id,
        estado: dispositivoActivo.estado,
        ultimo_contacto: dispositivoActivo.ultimo_contacto
      } : null
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dispositivos GPS</h1>
        <p className="text-sm text-slate-500">
          Control y vinculación de equipos de Traccar para los choferes del operativo actual.
        </p>
      </div>

      <GpsClient choferes={choferes} />

      <p className="text-xs text-slate-500">
        La ingesta de posiciones y la clasificación de actividad son un proceso automático (Traccar) que
        corre el Día D. Esta pantalla sirve para asegurar que todos los choferes tengan un equipo vinculado.
      </p>
    </div>
  );
}
