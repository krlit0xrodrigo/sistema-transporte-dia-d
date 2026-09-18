"use client";

import { useState, useTransition, useMemo } from "react";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boton, Input, Label } from "@/components/ui";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { UserPlus, Pencil, ShieldOff, ShieldCheck } from "lucide-react";
import { crearUsuario, modificarUsuario, cambiarEstadoUsuario } from "@/lib/acciones_usuario";

interface Rol {
  id: string;
  nombre: string;
  codigo: string;
}

export interface UsuarioView {
  id: string;
  email: string;
  nombre_completo: string;
  activo: boolean;
  rol_id: string;
  rol_nombre: string;
  candidato_id: string;
  candidato_nombre: string;
}

export function UsuariosClient({
  usuarios,
  roles,
  candidatos,
}: {
  usuarios: UsuarioView[];
  roles: Rol[];
  candidatos: { id: string; nombre_publico: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UsuarioView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRolId, setSelectedRolId] = useState<string>("");

  const handleOpenCrear = () => {
    setSelectedUser(null);
    setSelectedRolId("");
    setError(null);
    setOpen(true);
  };

  const handleOpenEdit = (u: UsuarioView) => {
    setSelectedUser(u);
    setSelectedRolId(u.rol_id);
    setError(null);
    setOpen(true);
  };

  const handleToggleActivo = (u: UsuarioView) => {
    const accionStr = u.activo ? "desactivar" : "activar";
    if (!confirm(`¿Estás seguro de ${accionStr} al usuario ${u.nombre_completo}?`)) return;
    
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", u.id);
      fd.append("activo", String(!u.activo));
      const res = await cambiarEstadoUsuario(fd);
      if (!res.ok) alert(res.error);
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    
    startTransition(async () => {
      let res;
      if (selectedUser) {
        fd.append("id", selectedUser.id);
        res = await modificarUsuario(fd);
      } else {
        res = await crearUsuario(fd);
      }
      
      if (res.ok) {
        setOpen(false);
      } else {
        setError(res.error || "Ocurrió un error.");
      }
    });
  };

  const columns = useMemo<Column<UsuarioView>[]>(() => [
    {
      key: "nombre",
      header: "Nombre",
      cell: (r) => <span className="font-medium text-slate-800">{r.nombre_completo}</span>,
    },
    {
      key: "email",
      header: "Correo / Usuario",
      cell: (r) => <span className="text-slate-500">{r.email}</span>,
    },
    {
      key: "rol",
      header: "Rol",
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{r.rol_nombre || "Sin Rol"}</span>
          {r.candidato_nombre && (
            <span className="text-xs text-muted-foreground">{r.candidato_nombre}</span>
          )}
        </div>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      cell: (r) => (
        <Badge variant={r.activo ? "success" : "danger"}>
          {r.activo ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      key: "acciones",
      header: "Acciones",
      cell: (r) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(r)} disabled={isPending} className="h-7 px-2">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleToggleActivo(r)} 
            disabled={isPending} 
            className={`h-7 px-2 ${r.activo ? "text-rose-600 hover:text-rose-700" : "text-emerald-600 hover:text-emerald-700"}`}
            title={r.activo ? "Desactivar" : "Activar"}
          >
            {r.activo ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </Button>
        </div>
      ),
    },
  ], [isPending]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Usuarios del Sistema</h1>
          <p className="text-sm text-slate-500">ABM de usuarios. Requiere permisos administrativos.</p>
        </div>
        <Boton onClick={handleOpenCrear} className="gap-2">
          <UserPlus className="h-4 w-4" /> Nuevo Usuario
        </Boton>
      </div>

      <DataTable 
        columns={columns} 
        data={usuarios} 
        searchPlaceholder="Buscar por nombre, correo o rol..."
        filasPorPagina={15}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedUser ? "Modificar Usuario" : "Crear Usuario"}</SheetTitle>
            <SheetDescription>
              {selectedUser 
                ? "Modifica los datos o cambia la contraseña del usuario."
                : "Crea un nuevo usuario que podrá acceder a la plataforma."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            {error && (
              <div className="p-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Nombre de Usuario (o Correo)</Label>
              <Input 
                id="username" 
                name="username" 
                type="text" 
                required 
                defaultValue={selectedUser?.email} 
                disabled={!!selectedUser} // No permitimos cambiar username por simplicidad y seguridad
                className="bg-white disabled:bg-slate-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nombre_completo">Nombre y Apellido</Label>
              <Input 
                id="nombre_completo" 
                name="nombre_completo" 
                required 
                defaultValue={selectedUser?.nombre_completo}
                className="bg-white" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rol_id">Rol</Label>
              <select 
                id="rol_id" 
                name="rol_id" 
                required 
                value={selectedRolId}
                onChange={(e) => setSelectedRolId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Selecciona un rol...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>

            {/* Selector de Candidato si el rol es Candidato o Concejal */}
            {(roles.find(r => r.id === selectedRolId)?.codigo?.includes("candidato") || roles.find(r => r.id === selectedRolId)?.codigo?.includes("concejal")) && (
              <div className="space-y-2">
                <Label htmlFor="candidato_id">Vincular a Candidato (Opcional)</Label>
                <select 
                  id="candidato_id" 
                  name="candidato_id" 
                  defaultValue={selectedUser?.candidato_id}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Ninguno</option>
                  {candidatos.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre_publico}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Al vincularlo, el usuario solo verá los datos de este candidato.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {selectedUser ? "Nueva Contraseña (Opcional)" : "Contraseña"}
              </Label>
              <Input 
                id="password" 
                name="password" 
                type="password" 
                required={!selectedUser} 
                minLength={6}
                className="bg-white" 
                placeholder={selectedUser ? "Dejar vacío para no cambiar" : ""}
              />
            </div>

            <SheetFooter className="mt-8">
              <Boton type="submit" disabled={isPending} className="w-full">
                {isPending ? "Guardando..." : "Guardar Usuario"}
              </Boton>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
