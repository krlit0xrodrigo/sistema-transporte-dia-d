"use client";

import { useState, useTransition } from "react";
import { guardarCandidato, guardarSupervisor, guardarBarrio } from "./actions";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Boton } from "@/components/ui";
import { Search, UserPlus, Users, MapPin, Edit2, AlertCircle } from "lucide-react";
import { Paginacion } from "@/components/ui/pagination";
import { useEffect } from "react";

type Candidato = { id: string; nombre: string; cupo: number };
type Supervisor = { id: string; alias: string; candidato_id: string; cupo: number };
type Barrio = { id: string; nombre: string; cupo: number };

interface EstructuraClientProps {
  eleccionId: string;
  candidatos: Candidato[];
  supervisores: Supervisor[];
  barrios: Barrio[];
}

export function EstructuraClient({ eleccionId, candidatos, supervisores, barrios }: EstructuraClientProps) {
  const [tab, setTab] = useState<"candidatos" | "supervisores" | "barrios">("candidatos");
  const [busqueda, setBusqueda] = useState("");
  const [isPending, startTransition] = useTransition();

  // Modales simulados con states para edición rápida (o creación)
  const [candidatoEdit, setCandidatoEdit] = useState<Partial<Candidato> | null>(null);
  const [supervisorEdit, setSupervisorEdit] = useState<Partial<Supervisor> | null>(null);
  const [barrioEdit, setBarrioEdit] = useState<Partial<Barrio> | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const termino = busqueda.toLowerCase();

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, busqueda]);

  const pageSize = 10;

  const candidatosFiltrados = candidatos.filter(c => c.nombre.toLowerCase().includes(termino));
  const supervisoresFiltrados = supervisores.filter(s => s.alias.toLowerCase().includes(termino));
  const barriosFiltrados = barrios.filter(b => b.nombre.toLowerCase().includes(termino));

  let currentListLength = 0;
  if (tab === "candidatos") currentListLength = candidatosFiltrados.length;
  else if (tab === "supervisores") currentListLength = supervisoresFiltrados.length;
  else if (tab === "barrios") currentListLength = barriosFiltrados.length;

  const totalPages = Math.ceil(currentListLength / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const candidatosPaginados = candidatosFiltrados.slice(startIndex, endIndex);
  const supervisoresPaginados = supervisoresFiltrados.slice(startIndex, endIndex);
  const barriosPaginados = barriosFiltrados.slice(startIndex, endIndex);

  const handleGuardarCandidato = (formData: FormData) => {
    startTransition(async () => {
      const res = await guardarCandidato(formData);
      if (res.error) alert(res.error);
      else setCandidatoEdit(null);
    });
  };

  const handleGuardarSupervisor = (formData: FormData) => {
    startTransition(async () => {
      const res = await guardarSupervisor(formData);
      if (res.error) alert(res.error);
      else setSupervisorEdit(null);
    });
  };

  const handleGuardarBarrio = (formData: FormData) => {
    startTransition(async () => {
      const res = await guardarBarrio(formData);
      if (res.error) alert(res.error);
      else setBarrioEdit(null);
    });
  };

  return (
    <div className="space-y-6">
      
      {/* TABS y BÚSQUEDA */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b pb-4">
        <div className="flex gap-2">
          <Boton tipo={tab === "candidatos" ? "primario" : "fantasma"} onClick={() => { setTab("candidatos"); setBusqueda(""); }}>
            <Users className="w-4 h-4 mr-2" /> Candidatos
          </Boton>
          <Boton tipo={tab === "supervisores" ? "primario" : "fantasma"} onClick={() => { setTab("supervisores"); setBusqueda(""); }}>
            <UserPlus className="w-4 h-4 mr-2" /> Supervisores
          </Boton>
          <Boton tipo={tab === "barrios" ? "primario" : "fantasma"} onClick={() => { setTab("barrios"); setBusqueda(""); }}>
            <MapPin className="w-4 h-4 mr-2" /> Barrios
          </Boton>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            type="text" 
            placeholder="Buscar..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_350px]">
        
        {/* LISTADO */}
        <Card className="h-fit">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                <tr>
                  <th className="px-4 py-3">
                    {tab === "candidatos" ? "Nombre del Candidato" : tab === "supervisores" ? "Alias del Supervisor" : "Nombre del Barrio"}
                  </th>
                  {tab === "supervisores" && <th className="px-4 py-3">Candidato Asociado</th>}
                  <th className="px-4 py-3 text-right">Cupo Límite</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                
                {tab === "candidatos" && (
                  candidatosPaginados.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{c.cupo}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setCandidatoEdit(c)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
            {tab === "barrios" && barrios.length === 0 && <p className="p-4 text-center text-slate-500">No hay barrios cargados.</p>}
                {tab === "supervisores" && (
                  supervisoresPaginados.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{s.alias}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {candidatos.find(c => c.id === s.candidato_id)?.nombre || "Desconocido"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{s.cupo}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSupervisorEdit(s)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}

                {tab === "barrios" && (
                  barriosPaginados.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{b.nombre}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-600">{b.cupo}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setBarrioEdit(b)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}

              </tbody>
            </table>
            
            {/* Vacío */}
            {tab === "candidatos" && candidatosFiltrados.length === 0 && <p className="p-4 text-center text-slate-500">No se encontraron candidatos.</p>}
            {tab === "supervisores" && supervisoresFiltrados.length === 0 && <p className="p-4 text-center text-slate-500">No se encontraron supervisores.</p>}

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center px-4 py-3 border-t">
                <span className="text-sm text-slate-500">
                  Mostrando {startIndex + 1} a {Math.min(endIndex, currentListLength)} de {currentListLength}
                </span>
                <Paginacion
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </div>
        </Card>

        {/* PANELES DE FORMULARIO LATERALES */}
        <div className="space-y-4">
          
          {tab === "candidatos" && (
            <Card className="border-blue-100 bg-blue-50/30">
              <CardHeader className="pb-3 border-b border-blue-100">
                <h3 className="font-semibold text-blue-900">
                  {candidatoEdit?.id ? "Editar Candidato" : "Nuevo Candidato"}
                </h3>
              </CardHeader>
              <CardContent className="pt-4">
                <form action={handleGuardarCandidato} className="space-y-4">
                  <input type="hidden" name="eleccion_id" value={eleccionId} />
                  {candidatoEdit?.id && <input type="hidden" name="candidato_id" value={candidatoEdit.id} />}
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Nombre Público</Label>
                    <Input name="nombre" required defaultValue={candidatoEdit?.nombre || ""} placeholder="Ej. Juan Pérez" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Cupo Inicial / Límite</Label>
                    <Input name="cupo" type="number" min={0} required defaultValue={candidatoEdit?.cupo || 0} />
                  </div>
                  
                  <div className="pt-2 flex gap-2">
                    <Button type="submit" disabled={isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
                      {isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    {candidatoEdit && (
                      <Button type="button" variant="outline" onClick={() => setCandidatoEdit(null)}>Cancelar</Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {tab === "supervisores" && (
            <Card className="border-emerald-100 bg-emerald-50/30">
              <CardHeader className="pb-3 border-b border-emerald-100">
                <h3 className="font-semibold text-emerald-900">
                  {supervisorEdit?.id ? "Editar Supervisor" : "Nuevo Supervisor"}
                </h3>
              </CardHeader>
              <CardContent className="pt-4">
                <form action={handleGuardarSupervisor} className="space-y-4">
                  <input type="hidden" name="eleccion_id" value={eleccionId} />
                  {supervisorEdit?.id && <input type="hidden" name="supervisor_id" value={supervisorEdit.id} />}
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Alias del Supervisor</Label>
                    <Input name="alias" required defaultValue={supervisorEdit?.alias || ""} placeholder="Ej. Sup Centro" />
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Pertenece al Candidato</Label>
                    <select name="candidato_id" required defaultValue={supervisorEdit?.candidato_id || ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                      <option value="">Seleccione un candidato...</option>
                      {candidatos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Cupo (Suma al Candidato)</Label>
                    <Input name="cupo" type="number" min={0} required defaultValue={supervisorEdit?.cupo || 0} />
                  </div>
                  
                  <div className="rounded border border-emerald-200 bg-emerald-100/50 p-2 text-[11px] text-emerald-800 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    El cupo asignado aquí impactará automáticamente en el límite total del candidato seleccionado.
                  </div>

                  <div className="pt-2 flex gap-2">
                    <Button type="submit" disabled={isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                      {isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    {supervisorEdit && (
                      <Button type="button" variant="outline" onClick={() => setSupervisorEdit(null)}>Cancelar</Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {tab === "barrios" && (
            <Card className="border-indigo-100 bg-indigo-50/30">
              <CardHeader className="pb-3 border-b border-indigo-100">
                <h3 className="font-semibold text-indigo-900">
                  {barrioEdit?.id ? "Editar Barrio" : "Nuevo Barrio"}
                </h3>
              </CardHeader>
              <CardContent className="pt-4">
                <form action={handleGuardarBarrio} className="space-y-4">
                  <input type="hidden" name="eleccion_id" value={eleccionId} />
                  {barrioEdit?.id && <input type="hidden" name="barrio_id" value={barrioEdit.id} />}
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Nombre del Barrio</Label>
                    <Input name="nombre" required defaultValue={barrioEdit?.nombre || ""} placeholder="Ej. Barrio Centro" />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Límite de Cupo</Label>
                    <Input name="cupo" type="number" min={0} required defaultValue={barrioEdit?.cupo || 0} />
                  </div>
                  
                  <div className="pt-2 flex gap-2">
                    <Button type="submit" disabled={isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                      {isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    {barrioEdit && (
                      <Button type="button" variant="outline" onClick={() => setBarrioEdit(null)}>Cancelar</Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
