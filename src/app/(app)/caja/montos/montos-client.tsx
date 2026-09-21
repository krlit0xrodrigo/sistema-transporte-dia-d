"use client";

import { useState, useTransition } from "react";
import { guardarMontosCaja } from "./actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Banknote, Droplet, CheckCircle, Calculator, Save, AlertCircle } from "lucide-react";

interface Tarifa {
  combustible: number;
  anticipo: number;
  pago_final: number;
}

interface MontosClientProps {
  eleccionId: string;
  tarifas: Record<string, Tarifa>;
  choferesActivos: any[];
}

const CATEGORIAS = [
  { id: "automovil", label: "Automóvil" },
  { id: "camioneta", label: "Camioneta" },
  { id: "minibus", label: "Minibús" },
  { id: "motocicleta", label: "Motocicleta" }
];

export function MontosClient({ eleccionId, tarifas, choferesActivos }: MontosClientProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("automovil");

  const formatInput = (val: string) => {
    const numeric = val.replace(/\D/g, "");
    return numeric ? Number(numeric).toLocaleString("es-PY") : "";
  };

  const [tarifasForm, setTarifasForm] = useState<Record<string, Record<string, string>>>(() => {
    const init: any = {};
    for (const cat of CATEGORIAS) {
      init[cat.id] = {
        combustible: (tarifas[cat.id]?.combustible || 0).toLocaleString("es-PY"),
        anticipo: (tarifas[cat.id]?.anticipo || 0).toLocaleString("es-PY"),
        pago_final: (tarifas[cat.id]?.pago_final || 0).toLocaleString("es-PY"),
      };
    }
    return init;
  });

  const handleChange = (cat: string, field: string, val: string) => {
    setTarifasForm(prev => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [field]: formatInput(val)
      }
    }));
  };

  const handleGuardar = (formData: FormData) => {
    startTransition(async () => {
      const res = await guardarMontosCaja(formData);
      if (res?.error) {
        alert("Error al guardar: " + res.error);
      }
    });
  };

  const formatearMonto = (valor: number) => {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: "PYG",
      maximumFractionDigits: 0,
    }).format(valor);
  };

  // --- CÁLCULO EN VIVO ---
  const choferesValidos = choferesActivos.filter(c => c.estado_servicio !== 'voluntario');
  const totalChoferesValidos = choferesValidos.length;

  let compCombustible = 0, desCombustible = 0, cantCombustible = 0;
  let compAnticipo = 0, desAnticipo = 0, cantAnticipo = 0;
  let compPagoFinal = 0, desPagoFinal = 0, cantPagoFinal = 0;

  choferesValidos.forEach(ch => {
    const cat = ch.vehiculo_categoria || 'automovil';
    const t = tarifas[cat] || { combustible: 0, anticipo: 0, pago_final: 0 };
    
    compCombustible += t.combustible;
    compAnticipo += t.anticipo;
    compPagoFinal += t.pago_final;

    if (ch.vale_entregado) {
      desCombustible += t.combustible;
      cantCombustible++;
    }
    if (ch.anticipo_pagado) {
      desAnticipo += t.anticipo;
      cantAnticipo++;
    }
    if (ch.pago_finalizado) {
      desPagoFinal += t.pago_final;
      cantPagoFinal++;
    }
  });

  const totalGeneralComprometido = compCombustible + compAnticipo + compPagoFinal;
  const totalGeneralDesembolsado = desCombustible + desAnticipo + desPagoFinal;

  const agruparPor = (campo: string) => {
    const agrupado = choferesValidos.reduce((acc, ch) => {
      const val = ch[campo] || "Sin Asignar";
      const cat = ch.vehiculo_categoria || 'automovil';
      const t = tarifas[cat] || { combustible: 0, anticipo: 0, pago_final: 0 };

      if (!acc[val]) {
        acc[val] = { nombre: val, totalChoferes: 0, comprometido: 0, desembolsado: 0 };
      }
      
      acc[val].totalChoferes++;
      acc[val].comprometido += t.combustible + t.anticipo + t.pago_final;
      
      if (ch.vale_entregado) acc[val].desembolsado += t.combustible;
      if (ch.anticipo_pagado) acc[val].desembolsado += t.anticipo;
      if (ch.pago_finalizado) acc[val].desembolsado += t.pago_final;

      return acc;
    }, {} as Record<string, any>);
    return Object.values(agrupado).sort((a: any, b: any) => b.totalChoferes - a.totalChoferes);
  };

  const renderTablaDesglose = (datos: any[], titulo: string) => (
    <Card className="mt-6">
      <CardHeader className="border-b px-4 py-3 bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 text-sm">Desglose por {titulo}</h3>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-semibold">{titulo}</th>
              <th className="px-4 py-3 font-semibold text-right">Choferes</th>
              <th className="px-4 py-3 font-semibold text-right">Comprometido</th>
              <th className="px-4 py-3 font-semibold text-right">Desembolsado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {datos.map((d, i) => (
              <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{d.nombre}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{d.totalChoferes}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatearMonto(d.comprometido)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{formatearMonto(d.desembolsado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="grid gap-6 md:grid-cols-[300px_1fr] lg:grid-cols-[350px_1fr]">
      
      {/* Panel Izquierdo: Configuración */}
      <Card className="h-fit">
        <CardHeader className="border-b px-4 py-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-tight">Asignar Montos</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Definí las tarifas por cada tipo de vehículo en esta elección.
          </p>
        </CardHeader>
        <div className="p-4">
          <form action={handleGuardar} className="space-y-6">
            <input type="hidden" name="eleccion_id" value={eleccionId} />

            <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-4 pb-1">
              {CATEGORIAS.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveTab(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors flex-1 text-center ${
                    activeTab === cat.id 
                      ? 'border-primary text-primary bg-primary/5' 
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {CATEGORIAS.map((cat) => (
              <div key={cat.id} className={activeTab === cat.id ? "space-y-3" : "hidden"}>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 items-center gap-2">
                    <Label className="text-[11px] font-medium text-slate-500">Combustible</Label>
                    <div className="col-span-2">
                      <input type="hidden" name={`${cat.id}_combustible`} value={tarifasForm[cat.id].combustible.replace(/\D/g, "")} />
                      <Input 
                        type="text" 
                        value={tarifasForm[cat.id].combustible}
                        onChange={(e) => handleChange(cat.id, "combustible", e.target.value)}
                        placeholder="0"
                        className="h-8 text-right tabular-nums font-medium text-xs bg-white" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-2">
                    <Label className="text-[11px] font-medium text-slate-500">Anticipo</Label>
                    <div className="col-span-2">
                      <input type="hidden" name={`${cat.id}_anticipo`} value={tarifasForm[cat.id].anticipo.replace(/\D/g, "")} />
                      <Input 
                        type="text" 
                        value={tarifasForm[cat.id].anticipo}
                        onChange={(e) => handleChange(cat.id, "anticipo", e.target.value)}
                        placeholder="0"
                        className="h-8 text-right tabular-nums font-medium text-xs bg-white" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-2">
                    <Label className="text-[11px] font-medium text-slate-500">Pago Final</Label>
                    <div className="col-span-2">
                      <input type="hidden" name={`${cat.id}_pago_final`} value={tarifasForm[cat.id].pago_final.replace(/\D/g, "")} />
                      <Input 
                        type="text" 
                        value={tarifasForm[cat.id].pago_final}
                        onChange={(e) => handleChange(cat.id, "pago_final", e.target.value)}
                        placeholder="0"
                        className="h-8 text-right tabular-nums font-medium text-xs bg-white" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="pt-4 sticky bottom-4">
              <Button type="submit" disabled={isPending} className="w-full shadow-md">
                <Save className="mr-2 h-4 w-4" />
                {isPending ? "Guardando..." : "Guardar Montos"}
              </Button>
            </div>
          </form>
        </div>
      </Card>

      {/* Panel Derecho: Dashboard Financiero */}
      <div className="space-y-4">
        
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 leading-relaxed">
            <strong>Cálculo en vivo:</strong> El monto <em>comprometido</em> se calcula asumiendo que los <strong>{totalChoferesValidos} choferes activos (excluyendo voluntarios)</strong> van a cobrar el 100% de la tarifa asignada según su tipo de vehículo. El monto <em>desembolsado</em> representa lo que ya fue pagado físicamente.
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Tarjeta Combustible */}
          <Card>
            <CardHeader className="border-b px-4 py-3 flex flex-row items-center gap-2 space-y-0">
              <Droplet className="h-5 w-5 text-indigo-500" />
              <h3 className="font-semibold text-slate-800">Combustible</h3>
            </CardHeader>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Desembolsado ({cantCombustible})</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatearMonto(desCombustible)}
                </p>
              </div>
              <div className="h-px bg-slate-100" />
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Comprometido</p>
                <p className="text-lg font-semibold text-slate-600 tabular-nums">
                  {formatearMonto(compCombustible)}
                </p>
              </div>
            </div>
          </Card>

          {/* Tarjeta Anticipo */}
          <Card>
            <CardHeader className="border-b px-4 py-3 flex flex-row items-center gap-2 space-y-0">
              <Banknote className="h-5 w-5 text-emerald-500" />
              <h3 className="font-semibold text-slate-800">Anticipos</h3>
            </CardHeader>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Desembolsado ({cantAnticipo})</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatearMonto(desAnticipo)}
                </p>
              </div>
              <div className="h-px bg-slate-100" />
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Comprometido</p>
                <p className="text-lg font-semibold text-slate-600 tabular-nums">
                  {formatearMonto(compAnticipo)}
                </p>
              </div>
            </div>
          </Card>

          {/* Tarjeta Pago Final */}
          <Card>
            <CardHeader className="border-b px-4 py-3 flex flex-row items-center gap-2 space-y-0">
              <CheckCircle className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold text-slate-800">Pagos Finales</h3>
            </CardHeader>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Desembolsado ({cantPagoFinal})</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatearMonto(desPagoFinal)}
                </p>
              </div>
              <div className="h-px bg-slate-100" />
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Comprometido</p>
                <p className="text-lg font-semibold text-slate-600 tabular-nums">
                  {formatearMonto(compPagoFinal)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900 text-white">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Total Comprometido</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatearMonto(totalGeneralComprometido)}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Total Desembolsado</p>
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">
                {formatearMonto(totalGeneralDesembolsado)}
              </p>
            </div>
          </div>
        </Card>

        {/* Tablas de Desglose Financiero */}
        {renderTablaDesglose(agruparPor("candidato"), "Candidato")}
        {renderTablaDesglose(agruparPor("supervisor"), "Supervisor")}
        {renderTablaDesglose(agruparPor("barrio"), "Barrio")}

      </div>
    </div>
  );
}
