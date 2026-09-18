"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Boton } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuditoriaClient({ auditLog, accesos }: { auditLog: any[]; accesos: any[] }) {
  const [tab, setTab] = useState<"cambios" | "accesos">("cambios");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const elementosPorPagina = 10;

  // Resetear página al cambiar de tab o buscar
  const handleTabChange = (newTab: "cambios" | "accesos") => {
    setTab(newTab);
    setPagina(1);
    setBusqueda("");
  };

  // Filtrado de Datos
  const termino = busqueda.toLowerCase();
  
  const datosFiltrados = tab === "cambios"
    ? auditLog.filter(log => 
        (log.usuario_id || "").toLowerCase().includes(termino) ||
        (log.tabla || "").toLowerCase().includes(termino) ||
        (log.operacion || "").toLowerCase().includes(termino) ||
        (log.rol_efectivo || "").toLowerCase().includes(termino) ||
        (log.registro_id || "").toLowerCase().includes(termino)
      )
    : accesos.filter(acceso => 
        (acceso.usuario_id || "").toLowerCase().includes(termino) ||
        (acceso.recurso || "").toLowerCase().includes(termino) ||
        (acceso.accion || "").toLowerCase().includes(termino)
      );

  // Paginación
  const totalPaginas = Math.ceil(datosFiltrados.length / elementosPorPagina) || 1;
  const indiceInicio = (pagina - 1) * elementosPorPagina;
  const datosPaginados = datosFiltrados.slice(indiceInicio, indiceInicio + elementosPorPagina);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border-b pb-4">
        <div className="flex gap-2 w-full sm:w-auto">
          <Boton 
            tipo={tab === "cambios" ? "primario" : "fantasma"} 
            onClick={() => handleTabChange("cambios")}
          >
            Historial de Cambios
          </Boton>
          <Boton 
            tipo={tab === "accesos" ? "primario" : "fantasma"} 
            onClick={() => handleTabChange("accesos")}
          >
            Accesos Sensibles
          </Boton>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            type="text" 
            placeholder="Buscar por usuario, tabla, motivo..." 
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b">
              {tab === "cambios" ? (
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Tabla</th>
                  <th className="px-4 py-3">Operación</th>
                  <th className="px-4 py-3">Registro ID</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Recurso</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Contexto</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y">
              {datosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron registros.
                  </td>
                </tr>
              ) : (
                datosPaginados.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(item.created_at || item.ocurrido_en).toLocaleString("es-ES", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2">{item.usuario_id || "Sistema"}</td>
                    
                    {tab === "cambios" ? (
                      <>
                        <td className="px-4 py-2">{item.rol_efectivo}</td>
                        <td className="px-4 py-2 font-mono text-xs">{item.tabla}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.operacion === "INSERT" ? "bg-emerald-100 text-emerald-800" :
                            item.operacion === "UPDATE" ? "bg-blue-100 text-blue-800" :
                            item.operacion === "DELETE" ? "bg-red-100 text-red-800" :
                            "bg-slate-100 text-slate-800"
                          }`}>
                            {item.operacion}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs truncate max-w-[150px]" title={item.registro_id}>
                          {item.registro_id}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 font-mono text-xs">{item.recurso}</td>
                        <td className="px-4 py-2 text-xs truncate max-w-[200px]" title={item.accion}>
                          {item.accion}
                        </td>
                        <td className="px-4 py-2 text-xs truncate max-w-[200px]" title={JSON.stringify(item.contexto)}>
                          {JSON.stringify(item.contexto)}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Paginador */}
        {datosFiltrados.length > elementosPorPagina && (
          <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6 bg-slate-50">
            <div className="flex flex-1 justify-between sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
              >
                Siguiente
              </Button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-700">
                  Mostrando <span className="font-medium">{indiceInicio + 1}</span> a{" "}
                  <span className="font-medium">
                    {Math.min(indiceInicio + elementosPorPagina, datosFiltrados.length)}
                  </span>{" "}
                  de <span className="font-medium">{datosFiltrados.length}</span> resultados
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium text-slate-700">
                  Página {pagina} de {totalPaginas}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
