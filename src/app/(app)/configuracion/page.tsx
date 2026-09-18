import { PageHeader } from "@/components/shared";
import type { Metadata } from "next";
import { getConfiguracion } from "./actions";
import { ConfigClient } from "./config-client";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const supabase = await crearClienteServidor();
  const config = await getConfiguracion();

  // Verificar si es super_admin
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRoles } = await supabase
    .from("usuario_roles")
    .select("roles!inner(codigo)")
    .eq("usuario_id", user?.id) as { data: { roles: { codigo: string } }[] | null };
  
  const esSuperAdmin = userRoles?.some(r => ["super_admin", "admin"].includes(r.roles.codigo)) || false;

  let usuariosHabilitados: any[] = [];
  let debugStr = "";
  if (esSuperAdmin) {
    const supabaseAdmin = await import("@/lib/supabase/server").then(m => m.crearClienteAdmin());
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from("usuarios")
      .select(`
        id,
        activo,
        email,
        nombre_completo,
        personas!fk_usuarios_persona ( ci, nombres, apellidos ),
        usuario_roles (
          roles ( codigo, nombre )
        )
      `)
      .eq("activo", true) as { data: any[] | null, error: any };
      
    if (usersError) {
      debugStr += ` | ERR: ${usersError.message}`;
    }

    if (usersData) {
      // Filtrar los que por rol tienen acceso a choferes.crear (candidato, concejal, etc. o todos menos consulta/auditor)
      usuariosHabilitados = usersData.filter(u => {
        const userRoles = u.usuario_roles?.map((ur: any) => ur.roles?.codigo) || [];
        return userRoles.includes("candidato") || 
               userRoles.includes("concejal") || 
               userRoles.includes("tesoreria") ||
               userRoles.includes("admin") ||
               userRoles.includes("super_admin") ||
               userRoles.includes("supervisor") ||
               userRoles.includes("consulta");
      }).map(u => {
        const personas = Array.isArray(u.personas) ? u.personas[0] : u.personas;
        const nombrePersona = personas ? `${personas.nombres || ""} ${personas.apellidos || ""}`.trim() : "";
        return {
          id: u.id,
          ci: personas?.ci || u.email || "",
          nombre: nombrePersona || u.nombre_completo || "Usuario sin nombre",
          roles: (u.usuario_roles || []).map((ur: any) => ur.roles?.nombre).join(", "),
        };
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader descripcion="Parámetros globales del sistema.">
        Configuración
      </PageHeader>
      


      <ConfigClient 
        initialConfig={config} 
        esSuperAdmin={esSuperAdmin} 
        usuarios={usuariosHabilitados} 
      />
    </div>
  );
}
