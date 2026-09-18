"use client";

import { useState, useMemo } from "react";
import { Badge, Card, CardHeader, Vacio, Paginacion } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatearCI, formatearFecha } from "@/lib/format";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export function AntecedentesClient({ antecedentes }: { antecedentes: any[] }) {
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const [filtros, setFiltros] = useState({
    persona: "",
    asignacion: "",
    vehiculo: "",
    eleccion: "",
    rol: "",
    resultado: "",
  });

  const handleFiltroChange = (key: keyof typeof filtros, value: string) => {
    setFiltros((prev) => ({ ...prev, [key]: value }));
    setPage(1); // reset to first page when searching
  };

  const filtrados = useMemo(() => {
    return antecedentes.filter((a) => {
      const matchPersona =
        !filtros.persona ||
        a.nombre_completo.toLowerCase().includes(filtros.persona.toLowerCase()) ||
        (a.ci && a.ci.includes(filtros.persona));

      const matchAsignacion =
        !filtros.asignacion ||
        (a.candidato_historico || "").toLowerCase().includes(filtros.asignacion.toLowerCase()) ||
        (a.supervisor_historico || "").toLowerCase().includes(filtros.asignacion.toLowerCase()) ||
        (a.barrio_historico || "").toLowerCase().includes(filtros.asignacion.toLowerCase());

      const matchVehiculo =
        !filtros.vehiculo ||
        (a.vehiculo_marca || "").toLowerCase().includes(filtros.vehiculo.toLowerCase()) ||
        (a.vehiculo_modelo || "").toLowerCase().includes(filtros.vehiculo.toLowerCase()) ||
        (a.vehiculo_chapa || "").toLowerCase().includes(filtros.vehiculo.toLowerCase());

      const matchEleccion =
        !filtros.eleccion ||
        (a.eleccion_nombre || "").toLowerCase().includes(filtros.eleccion.toLowerCase());

      const matchRol =
        !filtros.rol ||
        (a.rol || "").toLowerCase().includes(filtros.rol.toLowerCase());

      const matchResultado =
        !filtros.resultado ||
        (a.resultado || "").toLowerCase().includes(filtros.resultado.toLowerCase());

      return (
        matchPersona &&
        matchAsignacion &&
        matchVehiculo &&
        matchEleccion &&
        matchRol &&
        matchResultado
      );
    });
  }, [antecedentes, filtros]);

  const totalPages = Math.ceil(filtrados.length / itemsPerPage) || 1;
  const paginados = filtrados.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <Card>
      <CardHeader 
        titulo="Participaciones registradas" 
        extra={<span className="text-xs text-slate-500">{filtrados.length} resultados</span>} 
      />
      
      {antecedentes.length === 0 ? (
        <Vacio mensaje="No hay antecedentes históricos registrados." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium min-w-[200px]">Persona</th>
                <th className="px-4 py-2 font-medium min-w-[150px]">Asignación</th>
                <th className="px-4 py-2 font-medium min-w-[150px]">Vehículo</th>
                <th className="px-4 py-2 font-medium min-w-[120px]">Elección</th>
                <th className="px-4 py-2 font-medium min-w-[100px]">Rol</th>
                <th className="px-4 py-2 font-medium min-w-[120px]">Resultado</th>
                <th className="px-4 py-2 font-medium">Detalles</th>
              </tr>
              <tr className="border-b bg-slate-50/50">
                <th className="px-2 py-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-400" />
                    <Input
                      placeholder="Buscar..."
                      className="h-7 w-full pl-6 text-xs bg-white"
                      value={filtros.persona}
                      onChange={(e) => handleFiltroChange("persona", e.target.value)}
                    />
                  </div>
                </th>
                <th className="px-2 py-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-400" />
                    <Input
                      placeholder="Buscar..."
                      className="h-7 w-full pl-6 text-xs bg-white"
                      value={filtros.asignacion}
                      onChange={(e) => handleFiltroChange("asignacion", e.target.value)}
                    />
                  </div>
                </th>
                <th className="px-2 py-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-400" />
                    <Input
                      placeholder="Buscar..."
                      className="h-7 w-full pl-6 text-xs bg-white"
                      value={filtros.vehiculo}
                      onChange={(e) => handleFiltroChange("vehiculo", e.target.value)}
                    />
                  </div>
                </th>
                <th className="px-2 py-2">
                  <Input
                    placeholder="Filtrar..."
                    className="h-7 w-full px-2 text-xs bg-white"
                    value={filtros.eleccion}
                    onChange={(e) => handleFiltroChange("eleccion", e.target.value)}
                  />
                </th>
                <th className="px-2 py-2">
                  <Input
                    placeholder="Filtrar..."
                    className="h-7 w-full px-2 text-xs bg-white"
                    value={filtros.rol}
                    onChange={(e) => handleFiltroChange("rol", e.target.value)}
                  />
                </th>
                <th className="px-2 py-2">
                  <Input
                    placeholder="Filtrar..."
                    className="h-7 w-full px-2 text-xs bg-white"
                    value={filtros.resultado}
                    onChange={(e) => handleFiltroChange("resultado", e.target.value)}
                  />
                </th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-100">
              {paginados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No se encontraron resultados para la búsqueda.
                  </td>
                </tr>
              ) : (
                paginados.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{a.nombre_completo}</p>
                      <p className="text-xs tabular-nums text-slate-500">{formatearCI(a.ci)}</p>
                      {a.telefono && <p className="text-xs text-slate-500 mt-1">Tel: {a.telefono}</p>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {a.candidato_historico && <p><span className="font-medium">Candidato:</span> {a.candidato_historico}</p>}
                      {a.supervisor_historico && <p><span className="font-medium">Supervisor:</span> {a.supervisor_historico}</p>}
                      {a.barrio_historico && <p><span className="font-medium">Barrio:</span> {a.barrio_historico}</p>}
                      {!a.candidato_historico && !a.supervisor_historico && !a.barrio_historico && <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {a.vehiculo_marca && <p><span className="font-medium">Marca:</span> {a.vehiculo_marca}</p>}
                      {a.vehiculo_modelo && <p><span className="font-medium">Modelo:</span> {a.vehiculo_modelo}</p>}
                      {a.vehiculo_chapa && <p><span className="font-medium">Chapa:</span> {a.vehiculo_chapa}</p>}
                      {!a.vehiculo_marca && !a.vehiculo_modelo && !a.vehiculo_chapa && <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-slate-900">{a.eleccion_nombre}</p>
                      <p className="text-xs text-slate-500">{formatearFecha(a.eleccion_fecha)}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-600 capitalize">
                      {a.rol}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tono={
                        a.resultado === "cumplio" ? "ok" : 
                        a.resultado === "no_cumplio" ? "error" : 
                        a.resultado === "ok" ? "ok" : 
                        a.resultado === "ausente" ? "alerta" : 
                        a.resultado === "incumplimiento" ? "error" : "neutro"
                      }>
                        {a.resultado.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {a.km_recorridos && <p>Km: {a.km_recorridos}</p>}
                      {a.tuvo_gps && <p>GPS: Sí</p>}
                      {a.incidentes && <p className="text-rose-600">Incidentes: {a.incidentes}</p>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 bg-slate-50">
              <div className="text-xs text-slate-500">
                Mostrando {(page - 1) * itemsPerPage + 1} a {Math.min(page * itemsPerPage, filtrados.length)} de {filtrados.length}
              </div>
              <Paginacion 
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
