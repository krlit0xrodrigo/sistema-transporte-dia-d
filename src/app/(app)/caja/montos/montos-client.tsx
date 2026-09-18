"use client";

import { useState, useTransition } from "react";
import { guardarMontosCaja } from "./actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Banknote, Droplet, CheckCircle, Calculator, Save, AlertCircle } from "lucide-react";

interface MontosClientProps {
  eleccionId: string;
  montos: {
    combustible: number;
    anticipo: number;
    pagoFinal: number;
  };
  contadores: {
    totalChoferes: number;
    entregadosCombustible: number;
    pagadosAnticipo: number;
    finalizadosPago: number;
  };
  choferes: any[];
}

export function MontosClient({ eleccionId, montos, contadores, choferes }: MontosClientProps) {
  const [isPending, startTransition] = useTransition();

  const formatInput = (val: string) => {
    const numeric = val.replace(/\D/g, "");
    return numeric ? Number(numeric).toLocaleString("es-PY") : "";
  };

  const [combustible, setCombustible] = useState(montos.combustible ? montos.combustible.toLocaleString("es-PY") : "");
  const [anticipo, setAnticipo] = useState(montos.anticipo ? montos.anticipo.toLocaleString("es-PY") : "");
  const [pagoFinal, setPagoFinal] = useState(montos.pagoFinal ? montos.pagoFinal.toLocaleString("es-PY") : "");

  const handleGuardar = (formData: FormData) => {
    startTransition(async () => {
      const res = await guardarMontosCaja(formData);
      if (res.error) {
        alert("Error al guardar: " + res.error);
      }
    });
  };

  // Funciones para formatear moneda
  const formatearMonto = (valor: number) => {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: "PYG",
      maximumFractionDigits: 0,
    }).format(valor);
  };

  const agruparPor = (campo: string) => {
    const agrupado = choferes.reduce((acc, ch) => {
      const val = ch[campo] || "Sin Asignar";
      if (!acc[val]) {
        acc[val] = {
          nombre: val,
          totalChoferes: 0,
          entregadosCombustible: 0,
          pagadosAnticipo: 0,
          finalizadosPago: 0
        };
      }
      acc[val].totalChoferes++;
      if (ch.vale_entregado) acc[val].entregadosCombustible++;
      if (ch.anticipo_pagado) acc[val].pagadosAnticipo++;
      if (ch.pago_finalizado) acc[val].finalizadosPago++;
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
            {datos.map((d, i) => {
              const comprometido = d.totalChoferes * (montos.combustible + montos.anticipo + montos.pagoFinal);
              const desembolsado = (d.entregadosCombustible * montos.combustible) + 
                                   (d.pagadosAnticipo * montos.anticipo) + 
                                   (d.finalizadosPago * montos.pagoFinal);
              return (
                <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{d.nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{d.totalChoferes}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatearMonto(comprometido)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{formatearMonto(desembolsado)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="grid gap-6 md:grid-cols-[300px_1fr]">
      
      {/* Panel Izquierdo: Configuración */}
      <Card className="h-fit">
        <CardHeader className="border-b px-4 py-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-tight">Asignar Montos</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Definí la tarifa global para todos los choferes en esta elección.
          </p>
        </CardHeader>
        <div className="p-4">
          <form action={handleGuardar} className="space-y-4">
            <input type="hidden" name="eleccion_id" value={eleccionId} />

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Combustible (Gs)</Label>
              <input type="hidden" name="monto_combustible" value={combustible.replace(/\D/g, "")} />
              <Input 
                type="text" 
                value={combustible}
                onChange={(e) => setCombustible(formatInput(e.target.value))}
                placeholder="Ej. 100.000"
                className="text-right tabular-nums font-medium" 
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Anticipo (Gs)</Label>
              <input type="hidden" name="monto_anticipo" value={anticipo.replace(/\D/g, "")} />
              <Input 
                type="text" 
                value={anticipo}
                onChange={(e) => setAnticipo(formatInput(e.target.value))}
                placeholder="Ej. 50.000"
                className="text-right tabular-nums font-medium" 
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Pago Final (Gs)</Label>
              <input type="hidden" name="monto_pago_final" value={pagoFinal.replace(/\D/g, "")} />
              <Input 
                type="text" 
                value={pagoFinal}
                onChange={(e) => setPagoFinal(formatInput(e.target.value))}
                placeholder="Ej. 150.000"
                className="text-right tabular-nums font-medium" 
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isPending} className="w-full">
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
            <strong>Cálculo en vivo:</strong> El monto <em>comprometido</em> se calcula asumiendo que los <strong>{contadores.totalChoferes} choferes activos</strong> van a cobrar el 100% de la tarifa asignada. El monto <em>desembolsado</em> representa lo que ya fue pagado físicamente.
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
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Desembolsado ({contadores.entregadosCombustible})</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatearMonto(contadores.entregadosCombustible * montos.combustible)}
                </p>
              </div>
              <div className="h-px bg-slate-100" />
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Comprometido ({contadores.totalChoferes})</p>
                <p className="text-lg font-semibold text-slate-600 tabular-nums">
                  {formatearMonto(contadores.totalChoferes * montos.combustible)}
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
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Desembolsado ({contadores.pagadosAnticipo})</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatearMonto(contadores.pagadosAnticipo * montos.anticipo)}
                </p>
              </div>
              <div className="h-px bg-slate-100" />
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Comprometido ({contadores.totalChoferes})</p>
                <p className="text-lg font-semibold text-slate-600 tabular-nums">
                  {formatearMonto(contadores.totalChoferes * montos.anticipo)}
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
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Desembolsado ({contadores.finalizadosPago})</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {formatearMonto(contadores.finalizadosPago * montos.pagoFinal)}
                </p>
              </div>
              <div className="h-px bg-slate-100" />
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Comprometido ({contadores.totalChoferes})</p>
                <p className="text-lg font-semibold text-slate-600 tabular-nums">
                  {formatearMonto(contadores.totalChoferes * montos.pagoFinal)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900 text-white">
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Total General Comprometido</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatearMonto(
                  (contadores.totalChoferes * montos.combustible) +
                  (contadores.totalChoferes * montos.anticipo) +
                  (contadores.totalChoferes * montos.pagoFinal)
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Total Desembolsado</p>
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">
                {formatearMonto(
                  (contadores.entregadosCombustible * montos.combustible) +
                  (contadores.pagadosAnticipo * montos.anticipo) +
                  (contadores.finalizadosPago * montos.pagoFinal)
                )}
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
