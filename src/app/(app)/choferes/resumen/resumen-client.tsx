"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, UserCircle2, Users } from "lucide-react";

type ChoferRow = {
  candidato: string | null;
  supervisor: string | null;
  barrio: string | null;
  vehiculo_categoria: string | null;
  estado_servicio: string | null;
};

type ActiveEstructura = {
  candidatos: string[];
  supervisores: string[];
  barrios: string[];
};

type ResumenCounts = {
  total: number;
  estados: Record<string, number>;
  vehiculos: Record<string, number>;
};

type BarrioResumen = {
  nombre: string;
  counts: ResumenCounts;
};

type SupervisorResumen = {
  nombre: string;
  counts: ResumenCounts;
  barrios: Record<string, BarrioResumen>;
};

type CandidatoResumen = {
  nombre: string;
  counts: ResumenCounts;
  supervisores: Record<string, SupervisorResumen>;
};

function initCounts(): ResumenCounts {
  return {
    total: 0,
    estados: {},
    vehiculos: {}
  };
}

function addCounts(counts: ResumenCounts, row: ChoferRow) {
  counts.total++;
  
  const estado = row.estado_servicio || "desconocido";
  counts.estados[estado] = (counts.estados[estado] || 0) + 1;

  const vehiculo = row.vehiculo_categoria || "sin_vehiculo";
  counts.vehiculos[vehiculo] = (counts.vehiculos[vehiculo] || 0) + 1;
}

export function ResumenClient({ 
  choferes, 
  activeEstructura 
}: { 
  choferes: ChoferRow[], 
  activeEstructura: ActiveEstructura 
}) {
  const candSet = new Set(activeEstructura.candidatos);
  const supSet = new Set(activeEstructura.supervisores);
  const barSet = new Set(activeEstructura.barrios);

  // 1. Filtrar solo a los que pertenecen a la estructura activa
  const filtrados = choferes.filter(row => {
    if (!row.candidato || !candSet.has(row.candidato)) return false;
    if (row.supervisor && !supSet.has(row.supervisor)) return false;
    if (row.barrio && !barSet.has(row.barrio)) return false;
    return true;
  });

  // 2. Agrupar datos
  const tree: Record<string, CandidatoResumen> = {};
  const granTotal = initCounts();

  for (const row of filtrados) {
    const candName = row.candidato || "Sin Candidato";
    const supName = row.supervisor || "Sin Supervisor";
    const barName = row.barrio || "Sin Barrio";

    if (!tree[candName]) {
      tree[candName] = { nombre: candName, counts: initCounts(), supervisores: {} };
    }
    const cand = tree[candName];

    if (!cand.supervisores[supName]) {
      cand.supervisores[supName] = { nombre: supName, counts: initCounts(), barrios: {} };
    }
    const sup = cand.supervisores[supName];

    if (!sup.barrios[barName]) {
      sup.barrios[barName] = { nombre: barName, counts: initCounts() };
    }
    const bar = sup.barrios[barName];

    addCounts(granTotal, row);
    addCounts(cand.counts, row);
    addCounts(sup.counts, row);
    addCounts(bar.counts, row);
  }

  const candidatosList = Object.values(tree).sort((a, b) => b.counts.total - a.counts.total);

  return (
    <div className="space-y-6">
      {/* Tarjeta de Resumen Global */}
      <div className="rounded-2xl border border-red-200 dark:border-red-900/30 bg-gradient-to-br from-red-50/80 to-white dark:from-red-950/20 dark:to-slate-900 shadow-sm p-6 overflow-hidden relative">
        <div className="absolute -right-6 -top-6 text-red-500/5 dark:text-red-500/10">
          <Users className="w-48 h-48" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-red-600 dark:bg-red-700 rounded-xl text-white shadow-md">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-widest mb-1">Total General</p>
              <p className="text-4xl font-extrabold text-slate-800 dark:text-slate-100">{granTotal.total}</p>
            </div>
          </div>
          
          <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatsBreakdown counts={granTotal} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {candidatosList.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            No hay datos para mostrar en la estructura activa.
          </div>
        )}
        {candidatosList.map(cand => (
          <CandidatoNode key={cand.nombre} candidato={cand} />
        ))}
      </div>
    </div>
  );
}

function StatsBreakdown({ counts }: { counts: ResumenCounts }) {
  const c = counts.estados['contratado'] || 0;
  const v = counts.estados['voluntario'] || 0;
  const p = counts.estados['pendiente'] || 0;

  // Ordenar vehículos de mayor a menor
  const vehList = Object.entries(counts.vehiculos)
    .sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100/50 dark:border-slate-700/50 shadow-sm">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-0.5">Contratados</p>
        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{c}</p>
      </div>
      <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100/50 dark:border-slate-700/50 shadow-sm">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-0.5">Voluntarios</p>
        <p className="text-xl font-bold text-green-600 dark:text-green-400">{v}</p>
      </div>
      <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100/50 dark:border-slate-700/50 shadow-sm">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-0.5">Pendientes</p>
        <p className="text-xl font-bold text-slate-600 dark:text-slate-300">{p}</p>
      </div>
      <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-slate-100/50 dark:border-slate-700/50 shadow-sm flex flex-col justify-center">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1.5">Vehículos</p>
        <div className="flex flex-wrap gap-1">
           {vehList.length > 0 ? vehList.map(([veh, count]) => (
             <span key={veh} className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
               {veh === 'sin_vehiculo' ? 'Sin Vehículo' : veh.charAt(0).toUpperCase() + veh.slice(1)}: {count}
             </span>
           )) : (
             <span className="text-[10px] text-slate-400 font-medium">Ninguno</span>
           )}
        </div>
      </div>
    </>
  );
}

function CandidatoNode({ candidato }: { candidato: CandidatoResumen }) {
  const [open, setOpen] = useState(false);
  const supervisoresList = Object.values(candidato.supervisores).sort((a, b) => b.counts.total - a.counts.total);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm transition-all hover:border-red-300 dark:hover:border-red-700">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full flex flex-col lg:flex-row lg:items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 w-full lg:w-1/4">
          <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
             <UserCircle2 className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
             <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate text-lg">{candidato.nombre}</h4>
             <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Candidato</p>
          </div>
          <div className="lg:hidden ml-auto">
             {open ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
          </div>
        </div>
        
        <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-2 md:p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total</p>
            <p className="text-lg md:text-xl font-bold text-slate-700 dark:text-slate-200">{candidato.counts.total}</p>
          </div>
          <StatsBreakdown counts={candidato.counts} />
        </div>

        <div className="hidden lg:block">
           {open ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 p-4 lg:pl-16 space-y-3">
          <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Supervisores ({supervisoresList.length})</h5>
          {supervisoresList.length === 0 && (
             <p className="text-sm text-slate-500 dark:text-slate-400 italic">No hay supervisores activos con choferes.</p>
          )}
          {supervisoresList.map(sup => (
            <SupervisorNode key={sup.nombre} supervisor={sup} />
          ))}
        </div>
      )}
    </div>
  );
}

function SupervisorNode({ supervisor }: { supervisor: SupervisorResumen }) {
  const [open, setOpen] = useState(false);
  const barriosList = Object.values(supervisor.barrios).sort((a, b) => b.counts.total - a.counts.total);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 overflow-hidden shadow-sm">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full flex flex-col md:flex-row md:items-center gap-3 p-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 w-full md:w-1/4">
          {open ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate text-sm">{supervisor.nombre}</span>
        </div>
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 md:pb-0 items-center">
           <span className="text-xs font-medium bg-slate-100 dark:bg-slate-700 shrink-0 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-200">Total: {supervisor.counts.total}</span>
           <span className="text-xs font-medium bg-blue-50 dark:bg-blue-900/30 shrink-0 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 text-blue-700 dark:text-blue-400">Contratados: {supervisor.counts.estados['contratado'] || 0}</span>
           <span className="text-xs font-medium bg-green-50 dark:bg-green-900/30 shrink-0 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5 text-green-700 dark:text-green-400">Voluntarios: {supervisor.counts.estados['voluntario'] || 0}</span>
           {Object.keys(supervisor.counts.vehiculos).length > 0 && <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1 shrink-0" />}
           {Object.entries(supervisor.counts.vehiculos)
             .sort((a, b) => b[1] - a[1])
             .map(([veh, count]) => (
               <span key={veh} className="text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300">
                 {veh === 'sin_vehiculo' ? 'Sin Vehículo' : veh.charAt(0).toUpperCase() + veh.slice(1)}: {count}
               </span>
           ))}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 p-3 md:pl-10 space-y-2">
          {barriosList.map(bar => (
            <div key={bar.nombre} className="flex flex-col md:flex-row md:items-center gap-3 p-2 rounded-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
              <span className="text-sm text-slate-600 dark:text-slate-300 w-full md:w-1/4 font-medium truncate">{bar.nombre}</span>
              <div className="flex-1 flex gap-2 overflow-x-auto pb-1 md:pb-0 items-center">
                 <span className="text-xs font-medium bg-slate-100 dark:bg-slate-700 shrink-0 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-200">Total: {bar.counts.total}</span>
                 {bar.counts.estados['contratado'] > 0 && <span className="text-xs font-medium bg-blue-50 dark:bg-blue-900/30 shrink-0 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 text-blue-700 dark:text-blue-400">Contratados: {bar.counts.estados['contratado']}</span>}
                 {bar.counts.estados['voluntario'] > 0 && <span className="text-xs font-medium bg-green-50 dark:bg-green-900/30 shrink-0 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5 text-green-700 dark:text-green-400">Voluntarios: {bar.counts.estados['voluntario']}</span>}
                 {bar.counts.estados['pendiente'] > 0 && <span className="text-xs font-medium bg-slate-200 dark:bg-slate-700 shrink-0 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-300">Pendientes: {bar.counts.estados['pendiente']}</span>}
                 {Object.keys(bar.counts.vehiculos).length > 0 && <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1 shrink-0" />}
                 {Object.entries(bar.counts.vehiculos)
                   .sort((a, b) => b[1] - a[1])
                   .map(([veh, count]) => (
                     <span key={veh} className="text-[10px] bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shrink-0 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300">
                       {veh === 'sin_vehiculo' ? 'Sin Vehículo' : veh.charAt(0).toUpperCase() + veh.slice(1)}: {count}
                     </span>
                 ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
