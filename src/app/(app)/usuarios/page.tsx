import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  Aviso, Badge, Boton, Campo, Card, CardHeader, Tabla, Th, Titulo, Vacio, claseInput,
} from "@/components/ui";
import { formatearFecha } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Usuarios y roles.
 *
 * QUÉ SE HACE ACÁ Y QUÉ NO
 * ------------------------
 * Acá se administra **qué puede hacer** cada persona: su rol, su alcance y
 * si está activa. Todo eso vive en tablas con RLS, así que el control real
 * no es esta pantalla sino la base: un usuario sin `admin.roles` que llame
 * directo a PostgREST recibe el mismo rechazo.
 *
 * La **creación de la cuenta** (correo y contraseña) NO se hace acá, y es a
 * propósito: crear un usuario en Supabase Auth exige la `service_role` key,
 * que evita RLS por completo. Esa clave no entra en esta aplicación. Las
 * cuentas se invitan desde el panel de Supabase —Authentication → Invite— y
 * después aparecen en esta lista para asignarles rol.
 */

const DESCRIPCION_ROL: Record<string, string> = {
  super_admin: "Todo, incluida la configuración del sistema",
  admin: "Administra el operativo completo",
  coordinador: "Alta y asignación de choferes, importación",
  tesoreria: "Contratos, vales, anticipos y pagos",
  supervisor: "Sus choferes: consulta y edición",
  candidato: "Sus choferes: sólo consulta",
  operador: "Carga de datos y consulta de padrón",
  auditor: "Lee todo, incluida la bitácora. No modifica nada",
  consulta: "Solo lectura: busca personas y ve su ficha",
};

type SP = Promise<{ error?: string; ok?: string }>;

export default async function Usuarios({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: usuarios }, { data: roles }, { data: asignados }, { data: scopes }, { data: puede }] =
    await Promise.all([
      supabase.from("usuarios")
        .select("id, email, nombre_completo, activo, mfa_habilitado, ultimo_acceso, organizacion_id")
        .is("deleted_at", null).order("nombre_completo"),
      supabase.from("roles").select("id, codigo, nombre, nivel").order("nivel", { ascending: false }),
      supabase.from("usuario_roles").select("usuario_id, rol_id"),
      supabase.from("usuario_scopes").select("usuario_id, tipo"),
      supabase.rpc("auth_tiene_permiso", { p_codigo: "admin.roles" }),
    ]);

  type Usuario = {
    id: string; email: string; nombre_completo: string; activo: boolean;
    mfa_habilitado: boolean; ultimo_acceso: string | null; organizacion_id: string;
  };
  type Rol = { id: string; codigo: string; nombre: string; nivel: number };

  const lista = (usuarios ?? []) as Usuario[];
  const catalogo = (roles ?? []) as Rol[];
  const puedeGestionar = puede === true;

  const rolPorUsuario = new Map<string, string[]>();
  for (const a of (asignados ?? []) as { usuario_id: string; rol_id: string }[]) {
    const codigo = catalogo.find((r) => r.id === a.rol_id)?.codigo;
    if (codigo) rolPorUsuario.set(a.usuario_id, [...(rolPorUsuario.get(a.usuario_id) ?? []), codigo]);
  }
  const scopePorUsuario = new Map<string, string>();
  for (const s of (scopes ?? []) as { usuario_id: string; tipo: string }[]) {
    scopePorUsuario.set(s.usuario_id, s.tipo);
  }

  /** Un usuario, un rol: se reemplaza el anterior en lugar de acumular. */
  async function asignarRol(formData: FormData) {
    "use server";
    const s = await crearClienteServidor();
    const usuarioId = String(formData.get("usuario_id"));
    const rolId = String(formData.get("rol_id"));
    const orgId = String(formData.get("organizacion_id"));
    const alcance = String(formData.get("scope") ?? "global");

    const { error: borrado } = await s.from("usuario_roles").delete().eq("usuario_id", usuarioId);
    if (borrado) {
      redirect(`/usuarios?error=${encodeURIComponent(
        "Tu usuario no tiene permiso para asignar roles (admin.roles).")}`);
    }

    const { error } = await s.from("usuario_roles")
      .insert({ usuario_id: usuarioId, rol_id: rolId, organizacion_id: orgId });
    if (error) redirect(`/usuarios?error=${encodeURIComponent(traducir(error.message))}`);

    // Sin scope vigente, las políticas no le muestran ninguna fila: un rol
    // sin alcance es un usuario que entra y no ve nada.
    await s.from("usuario_scopes").delete().eq("usuario_id", usuarioId);
    await s.from("usuario_scopes")
      .insert({ usuario_id: usuarioId, organizacion_id: orgId, tipo: alcance });

    revalidatePath("/usuarios");
    redirect("/usuarios?ok=rol");
  }

  async function cambiarEstado(formData: FormData) {
    "use server";
    const s = await crearClienteServidor();
    const { error } = await s.from("usuarios")
      .update({ activo: formData.get("activo") === "1", updated_at: new Date().toISOString() })
      .eq("id", String(formData.get("usuario_id")));
    if (error) redirect(`/usuarios?error=${encodeURIComponent(traducir(error.message))}`);
    revalidatePath("/usuarios");
    redirect("/usuarios?ok=estado");
  }

  return (
    <div className="space-y-6">
      <Titulo descripcion="Quién entra al sistema y qué puede hacer. El control real lo aplica la base de datos, no esta pantalla.">
        Usuarios
      </Titulo>

      {sp.error && <Aviso tono="error">{decodeURIComponent(sp.error)}</Aviso>}
      {sp.ok === "rol" && <Aviso tono="ok">Rol y alcance actualizados.</Aviso>}
      {sp.ok === "estado" && <Aviso tono="ok">Estado del usuario actualizado.</Aviso>}

      {!puedeGestionar && (
        <Aviso tono="info">
          Podés ver la lista pero no modificarla: te falta el permiso <code>admin.roles</code>.
        </Aviso>
      )}

      <Card>
        <CardHeader titulo="Usuarios de la organización"
                    extra={<span className="text-xs text-tinta-tenue">{lista.length}</span>} />
        {lista.length === 0 ? (
          <Vacio mensaje="No hay usuarios todavía"
                 detalle="Las cuentas se invitan desde el panel de Supabase (Authentication → Invite) y después aparecen acá para asignarles rol." />
        ) : (
          <Tabla>
            <thead className="bg-zinc-50">
              <tr>
                <Th>Nombre</Th>
                <Th>Correo</Th>
                <Th>Rol</Th>
                <Th>Alcance</Th>
                <Th>Último acceso</Th>
                <Th>Estado</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lista.map((u) => {
                const rolesUsuario = rolPorUsuario.get(u.id) ?? [];
                return (
                  <tr key={u.id} className={u.activo ? "" : "bg-zinc-50/60"}>
                    <td className="px-4 py-2.5 font-medium">{u.nombre_completo}</td>
                    <td className="px-4 py-2.5 text-tinta-suave">{u.email}</td>
                    <td className="px-4 py-2.5">
                      {rolesUsuario.length === 0
                        ? <Badge tono="alerta">Sin rol</Badge>
                        : rolesUsuario.map((r) => (
                            <span key={r} className="mr-1 inline-block">
                              <Badge tono={r === "consulta" ? "info" : "marca"}>{r}</Badge>
                            </span>
                          ))}
                    </td>
                    <td className="px-4 py-2.5 text-tinta-suave">
                      {scopePorUsuario.get(u.id) ?? <span className="text-amber-700">sin alcance</span>}
                    </td>
                    <td className="px-4 py-2.5 text-tinta-suave">{formatearFecha(u.ultimo_acceso)}</td>
                    <td className="px-4 py-2.5">
                      {u.activo ? <Badge tono="ok">Activo</Badge> : <Badge tono="neutro">Inactivo</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      {puedeGestionar && (
                        <form action={cambiarEstado}>
                          <input type="hidden" name="usuario_id" value={u.id} />
                          <input type="hidden" name="activo" value={u.activo ? "0" : "1"} />
                          <button className="text-xs font-medium text-rojo-700 underline underline-offset-2">
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Card>

      {puedeGestionar && lista.length > 0 && (
        <Card>
          <CardHeader titulo="Asignar rol y alcance"
                      descripcion="Un usuario, un rol. El nuevo reemplaza al anterior." />
          <form action={asignarRol} className="grid gap-4 p-4 sm:grid-cols-4">
            <input type="hidden" name="organizacion_id" value={lista[0].organizacion_id} />
            <Campo etiqueta="Usuario" nombre="usuario_id" requerido>
              <select id="usuario_id" name="usuario_id" required className={claseInput}>
                {lista.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre_completo} — {u.email}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Rol" nombre="rol_id" requerido>
              <select id="rol_id" name="rol_id" required className={claseInput}>
                {catalogo.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Alcance" nombre="scope" requerido
                   ayuda="Global ve todo el operativo. Los demás, sólo lo suyo.">
              <select id="scope" name="scope" required defaultValue="global" className={claseInput}>
                <option value="global">Global</option>
                <option value="candidato">Por candidato</option>
                <option value="barrio">Por barrio</option>
                <option value="supervisor">Por supervisor</option>
              </select>
            </Campo>
            <div className="flex items-end">
              <Boton type="submit" className="w-full">Asignar</Boton>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader titulo="Qué puede hacer cada rol" />
        <ul className="divide-y divide-zinc-100">
          {catalogo.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <Badge tono={r.codigo === "consulta" ? "info" : "neutro"}>{r.codigo}</Badge>
              <span className="text-tinta-suave">{DESCRIPCION_ROL[r.codigo] ?? r.nombre}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Aviso tono="info">
        <strong>Para crear una cuenta nueva:</strong> Supabase → Authentication → Invite, con el
        correo de la persona. Cuando entre por primera vez aparece en esta lista y recién ahí se
        le asigna el rol. La creación de cuentas no se hace desde acá porque exige la clave{" "}
        <code>service_role</code>, que evita RLS por completo y no entra en esta aplicación.
      </Aviso>
    </div>
  );
}

function traducir(mensaje: string): string {
  if (mensaje.includes("row-level security") || mensaje.includes("policy")) {
    return "La base rechazó el cambio: tu usuario no tiene permiso para esto.";
  }
  if (mensaje.includes("duplicate key")) return "Ese usuario ya tiene ese rol asignado.";
  return mensaje;
}
