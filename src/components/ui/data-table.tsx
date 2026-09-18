"use client";

import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input, Boton, Paginacion } from "@/components/ui";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
}

export function DataTable<T extends object>({ 
  data, 
  columns,
  searchPlaceholder = "Buscar...",
  filasPorPagina = 10
}: { 
  data: T[]; 
  columns: Column<T>[];
  searchPlaceholder?: string;
  filasPorPagina?: number;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lowerSearch = searchTerm.toLowerCase();
    return data.filter(row => {
      // Búsqueda simple sobre todos los valores
      return Object.values(row).some(val => 
        val != null && String(val).toLowerCase().includes(lowerSearch)
      );
    });
  }, [data, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / filasPorPagina));
  const currentData = filteredData.slice((currentPage - 1) * filasPorPagina, currentPage * filasPorPagina);

  return (
    <div className="space-y-4">
      {/* Controles de Búsqueda */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
          className="pl-9 h-9 bg-white" 
          placeholder={searchPlaceholder} 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Tabla */}
      <div className="rounded-md border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b">
              <tr>
                {columns.map(col => (
                  <th key={col.key} className="px-4 py-3 whitespace-nowrap">{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron resultados.
                  </td>
                </tr>
              ) : (
                currentData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3">
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">
            Mostrando {(currentPage - 1) * filasPorPagina + 1} a {Math.min(currentPage * filasPorPagina, filteredData.length)} de {filteredData.length}
          </p>
          <Paginacion 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}
