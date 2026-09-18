"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor, crearClienteAdmin } from "@/lib/supabase/server";

export async function crearUsuario(formData: FormData) {
  try {
    const supabase = await crearClienteServidor();
    // 1. Validar permisos (debe ser admin o super_admin)
    const { data: tienePermiso } = await supabase.rpc("auth_tiene_permiso", { p_codigo: "admin.usuarios" });
    if (!tienePermiso) {
      return { ok: false, error: "No tienes permiso para crear usuarios." };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    // Obtener la organización del usuario actual
    const { data: miOrg } = await supabase.from("usuarios").select("organizacion_id").eq("id", user.id).single();
    if (!miOrg) throw new Error("Sin organización");

    const rawUsername = String(formData.get("username")).trim();
    const password = String(formData.get("password"));
    const nombre_completo = String(formData.get("nombre_completo")).trim();
    const rolId = String(formData.get("rol_id")).trim();
    const candidatoId = formData.get("candidato_id")?.toString().trim();

    if (!rawUsername || !password || !nombre_completo || !rolId) {
      return { ok: false, error: "Todos los campos son obligatorios." };
    }

    const authEmail = rawUsername.includes("@") ? rawUsername : `${rawUsername}@dia-d.local`;

    // 2. Crear usuario en Auth usando el Admin Client
    const adminClient = crearClienteAdmin();
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true
    });

    if (authError) {
      return { ok: false, error: "Error de auth: " + authError.message };
    }

    const newUserId = authData.user.id;

    // 3. Insertar en tabla usuarios (saltando RLS si es necesario, o usando el cliente normal si la policy lo permite)
    // La RLS de usuarios permite insert a super_admin y admin.
    const { error: dbError } = await supabase.from("usuarios").insert({
      id: newUserId,
      organizacion_id: miOrg.organizacion_id,
      email: rawUsername,
      nombre_completo,
      activo: true
    });

    if (dbError) {
      // Intento rollback en Auth (best effort)
      await adminClient.auth.admin.deleteUser(newUserId);
      return { ok: false, error: "Error al guardar perfil: " + dbError.message };
    }

    // 4. Asignar el rol
    const { error: rolError } = await supabase.from("usuario_roles").insert({
      usuario_id: newUserId,
      rol_id: rolId,
      organizacion_id: miOrg.organizacion_id
    });

    if (rolError) {
      return { ok: false, error: "Usuario creado, pero hubo un error asignando el rol." };
    }

    // 5. Asignar scope si aplica
    if (candidatoId) {
      await supabase.from("usuario_scopes").insert({
        usuario_id: newUserId,
        organizacion_id: miOrg.organizacion_id,
        tipo: 'candidato',
        candidato_id: candidatoId
      });
    }

    revalidatePath("/usuarios");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error inesperado" };
  }
}

export async function modificarUsuario(formData: FormData) {
  try {
    const supabase = await crearClienteServidor();
    const { data: tienePermiso } = await supabase.rpc("auth_tiene_permiso", { p_codigo: "admin.usuarios" });
    if (!tienePermiso) return { ok: false, error: "No tienes permiso." };

    const id = String(formData.get("id"));
    const nombre_completo = String(formData.get("nombre_completo")).trim();
    const rolId = String(formData.get("rol_id")).trim();
    const newPassword = String(formData.get("password") || "").trim();
    const candidatoId = formData.get("candidato_id")?.toString().trim();

    // 1. Update Profile
    const { error: updateErr } = await supabase
      .from("usuarios")
      .update({ nombre_completo })
      .eq("id", id);
      
    if (updateErr) throw new Error(updateErr.message);

    // 2. Update Role (Delete old and insert new, for simplicity since it's 1 role per user in our UI)
    // Actually, we must fetch the org_id to assign it.
    const { data: userRow } = await supabase.from("usuarios").select("organizacion_id").eq("id", id).single();
    if (userRow) {
      await supabase.from("usuario_roles").delete().eq("usuario_id", id);
      await supabase.from("usuario_roles").insert({
        usuario_id: id,
        rol_id: rolId,
        organizacion_id: userRow.organizacion_id
      });
      
      // Update scope
      await supabase.from("usuario_scopes").delete().eq("usuario_id", id);
      if (candidatoId) {
        await supabase.from("usuario_scopes").insert({
          usuario_id: id,
          organizacion_id: userRow.organizacion_id,
          tipo: 'candidato',
          candidato_id: candidatoId
        });
      }
    }

    // 3. Update password if provided
    if (newPassword) {
      const adminClient = crearClienteAdmin();
      const { error: passErr } = await adminClient.auth.admin.updateUserById(id, { password: newPassword });
      if (passErr) throw new Error("Contraseña no actualizada: " + passErr.message);
    }

    revalidatePath("/usuarios");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function cambiarEstadoUsuario(formData: FormData) {
  try {
    const supabase = await crearClienteServidor();
    const { data: tienePermiso } = await supabase.rpc("auth_tiene_permiso", { p_codigo: "admin.usuarios" });
    if (!tienePermiso) return { ok: false, error: "No tienes permiso." };

    const id = String(formData.get("id"));
    const activo = formData.get("activo") === "true";

    const { error } = await supabase
      .from("usuarios")
      .update({ activo })
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath("/usuarios");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
