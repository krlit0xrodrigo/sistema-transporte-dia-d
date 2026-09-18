"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function FiltrosTablaChoferes({ 
  candidatos, 
  barrios 
}: { 
  candidatos: string[], 
  barrios: string[] 
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ci, setCi] = useState(searchParams.get("ci") || "");
  const [nombre, setNombre] = useState(searchParams.get("nombre") || "");
  
  const candidato = searchParams.get("candidato") || "";
  const barrio = searchParams.get("barrio") || "";
  const padron = searchParams.get("padron") || "";

  const actualizarParams = useCallback((nuevos: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    let cambio = false;
    
    for (const [key, value] of Object.entries(nuevos)) {
      if (value) {
        if (params.get(key) !== value) {
          params.set(key, value);
          cambio = true;
        }
      } else {
        if (params.has(key)) {
          params.delete(key);
          cambio = true;
        }
      }
    }

    if (cambio) {
      params.set("page", "1");
      router.push(`?${params.toString()}`);
    }
  }, [searchParams, router]);

  // Debounce para inputs de texto
  useEffect(() => {
    const timer = setTimeout(() => {
      actualizarParams({ ci, nombre });
    }, 400);
    return () => clearTimeout(timer);
  }, [ci, nombre, actualizarParams]);

  const inputClass = "w-full text-xs p-1 border rounded bg-background font-normal";
  const selectClass = "w-full text-xs p-1 border rounded bg-background font-normal";

  return (
    <tr className="bg-zinc-50/50">
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        {/* Orden */}
      </th>
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        <input 
          type="text" 
          placeholder="Buscar C.I." 
          className={inputClass}
          value={ci}
          onChange={e => setCi(e.target.value)}
        />
      </th>
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        <input 
          type="text" 
          placeholder="Buscar Nombre" 
          className={inputClass}
          value={nombre}
          onChange={e => setNombre(e.target.value)}
        />
      </th>
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        <select className={selectClass} value={candidato} onChange={e => actualizarParams({ candidato: e.target.value })}>
          <option value="">Todos</option>
          {candidatos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </th>
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        <select className={selectClass} value={barrio} onChange={e => actualizarParams({ barrio: e.target.value })}>
          <option value="">Todos</option>
          {barrios.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </th>
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        {/* Teléfono */}
      </th>
      <th className="px-4 py-1 border border-border bg-muted/95 backdrop-blur-sm z-10 sticky top-[41px]">
        <select className={selectClass} value={padron} onChange={e => actualizarParams({ padron: e.target.value })}>
          <option value="">Todos</option>
          <option value="verificada">Verificado</option>
          <option value="fuera_de_padron">Fuera de padrón</option>
          <option value="discrepancia_nombre">Nombre no coincide</option>
        </select>
      </th>
    </tr>
  );
}
