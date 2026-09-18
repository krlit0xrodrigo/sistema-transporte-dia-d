"use client";

import { useState } from "react";
import { Boton, Card, CardHeader } from "@/components/ui";
import { formatearCI } from "@/lib/format";

type Usuario = {
  id: string;
  ci: string;
  nombre: string;
  roles: string;
};

interface Props {
  usuarios: Usuario[];
  bloqueados: string[];
  onChange: (nuevosBloqueados: string[]) => void;
}

export function BloqueoAltaClient({ usuarios, bloqueados, onChange }: Props) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = usuarios.filter((u) => {
    if (!busqueda) return true;
    const term = busqueda.toLowerCase();
    return u.nombre.toLowerCase().includes(term) || u.ci.includes(term) || u.roles.toLowerCase().includes(term);
  });

  const isBloqueado = (id: string) => bloqueados.includes(id);

  const toggleBloqueo = (id: string) => {
    if (isBloqueado(id)) {
      onChange(bloqueados.filter((b) => b !== id));
    } else {
      onChange([...bloqueados, id]);
    }
  };

  return (
    <Card className="bg-white">
      <CardHeader 
        titulo="Gestión de Accesos: Alta de Chofer" 
        descripcion="Controla individualmente qué usuarios pueden registrar choferes en el sistema. Los roles originales se mantienen, pero podés bloquear el acceso específicamente a esta pantalla."
      />
      
      <div className="p-4 border-b border-slate-100">
        <input 
          type="text"
          placeholder="Buscar usuario por cédula, nombre o rol..."
          className="w-full max-w-md rounded-md border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 font-medium">Cédula</th>
              <th className="px-4 py-2 font-medium">Nombre Completo</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium text-right">Permiso Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.map((u) => {
              const bloqueado = isBloqueado(u.id);
              return (
                <tr key={u.id} className={bloqueado ? "bg-rose-50/50" : ""}>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{formatearCI(u.ci)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{u.nombre}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{u.roles}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleBloqueo(u.id)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${bloqueado ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      role="switch"
                      aria-checked={!bloqueado}
                    >
                      <span className="sr-only">Habilitar Alta</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${bloqueado ? 'translate-x-0' : 'translate-x-4'}`}
                      />
                    </button>
                    <span className={`ml-2 inline-block w-16 text-xs font-medium text-left ${bloqueado ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {bloqueado ? 'Bloqueado' : 'Permitido'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No se encontraron usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
