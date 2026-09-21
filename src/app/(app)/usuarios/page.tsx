import { crearClienteServidor } from "@/lib/supabase/server";
import { UsuariosClient, UsuarioView } from "./usuarios-client";

export default async function UsuariosPage() {
  const supabase = await crearClienteServidor();

  // Verificar permisos para ver la página (requiere admin.usuarios)
  const { data: tienePermiso } = await supabase.rpc("auth_tiene_permiso", { p_codigo: "admin.usuarios" });
  if (!tienePermiso) {
    return (
      <div className="p-8 text-center text-rose-800 bg-rose-50 rounded-lg border border-rose-200">
        No tienes permisos suficientes para acceder a la gestión de usuarios.
      </div>
    );
  }

  // Cargar usuarios de la misma organización, junto con sus roles
  const { data: usuariosData } = await supabase
    .from("usuarios")
    .select(`
      id, email, nombre_completo, activo,
      usuario_roles (
        rol_id,
        roles ( nombre, codigo )
      ),
      usuario_scopes (
        candidato_id,
        candidatos ( nombre_publico )
      )
    `)
    .order("nombre_completo");

  // Aplanar los datos para la tabla
  const usuarios: UsuarioView[] = (usuariosData || []).map((u: any) => {
    const rol = u.usuario_roles?.[0] || {};
    const scope = u.usuario_scopes?.find((s: any) => s.candidato_id) || {};
    return {
      id: u.id,
      email: u.email,
      nombre_completo: u.nombre_completo,
      activo: u.activo,
      rol_id: rol.rol_id || "",
      rol_nombre: rol.roles?.nombre || "Sin Rol",
      candidato_id: scope.candidato_id || "",
      candidato_nombre: scope.candidatos?.nombre_publico || ""
    };
  });

  // Cargar roles disponibles
  const { data: rolesData } = await supabase
    .from("roles")
    .select("id, nombre, codigo")
    .order("nivel", { ascending: false });

  // Excluir roles que ya no se utilizarán en el operativo
  const rolesOcultos = ["admin", "coordinador", "operador", "auditor"];
  const rolesDisponibles = (rolesData || []).filter(r => !rolesOcultos.includes(r.codigo));

  // Cargar candidatos disponibles para el selector
  const { data: candidatosData } = await supabase
    .from("candidatos")
    .select("id, nombre_publico")
    .eq("activo", true)
    .order("nombre_publico");

  return (
    <UsuariosClient 
      usuarios={usuarios} 
      roles={rolesDisponibles} 
      candidatos={candidatosData || []}
    />
  );
}
