"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Card, CardHeader, Vacio } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Search, FileText, Droplet, Banknote, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { formatearCI } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface FilaCaja {
  chofer_id: string;
  ci: string;
  nombre_completo: string;
  candidato: string | null;
  contrato_firmado: boolean;
  vale_entregado: boolean;
  anticipo_pagado: boolean;
  pago_finalizado: boolean;
  autorizado_por: string | null;
  actividad: string | null;
  estado_servicio: "contratado" | "voluntario" | "pendiente";
}

/** Un botón mejorado que dispara una acción de servidor sobre un chofer usando useTransition para UI optimista. */
function AccionBoton({
  accion,
  chofer,
  texto,
  deshabilitado,
  titulo,
  icono: Icon,
  variant = "outline",
}: {
  accion: (fd: FormData) => Promise<unknown>;
  chofer: string;
  texto: string;
  deshabilitado?: boolean;
  titulo?: string;
  icono?: React.ElementType;
  variant?: "outline" | "default" | "secondary";
}) {
  const [isPending, startTransition] = useTransition();

  const formAction = (formData: FormData) => {
    startTransition(async () => {
      const res = (await accion(formData)) as any;
      if (res && res.ok === false && res.error) {
        alert(res.error);
      }
    });
  };

  return (
    <form action={formAction}>
      <input type="hidden" name="chofer_id" value={chofer} />
      <Button
        type="submit"
        disabled={deshabilitado || isPending}
        title={titulo}
        variant={variant}
        size="sm"
        className="h-7 px-2 text-xs w-full justify-start font-medium"
      >
        {Icon && <Icon className="mr-1.5 h-3 w-3" />}
        {isPending ? "Procesando..." : texto}
      </Button>
    </form>
  );
}

export function CajaClient({
  filasIniciales,
  acciones,
}: {
  filasIniciales: FilaCaja[];
  acciones: {
    firmarContrato: (fd: FormData) => Promise<unknown>;
    entregarVale: (fd: FormData) => Promise<unknown>;
    pagarAnticipo: (fd: FormData) => Promise<unknown>;
    marcarPagoFinal: (fd: FormData) => Promise<unknown>;
    autorizarPago: (fd: FormData) => Promise<unknown>;
  };
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Filtrado
  const filtrados = filasIniciales.filter((f) => {
    if (!q.trim()) return true;
    const query = q.trim().toLowerCase();
    const isNumber = /^[0-9.]+$/.test(query);
    if (isNumber) {
      return f.ci.replace(/\D/g, "").includes(query.replace(/\D/g, ""));
    }
    return (
      f.nombre_completo.toLowerCase().includes(query) ||
      (f.candidato || "").toLowerCase().includes(query)
    );
  });

  // Paginación
  const totalPages = Math.ceil(filtrados.length / itemsPerPage) || 1;
  const paginados = filtrados.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Totales (solo contratados)
  const contratados = filasIniciales.filter((f) => f.estado_servicio === "contratado");
  const totalChoferes = contratados.length;
  const tContratos = contratados.filter((f) => f.contrato_firmado).length;
  const tVales = contratados.filter((f) => f.vale_entregado).length;
  const tAnticipos = contratados.filter((f) => f.anticipo_pagado).length;
  const tPagos = contratados.filter((f) => f.pago_finalizado).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <FileText className="h-4 w-4" />
            <h3 className="text-sm font-medium">Contratos</h3>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{tContratos} <span className="text-sm font-normal text-slate-400">/ {totalChoferes}</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Droplet className="h-4 w-4" />
            <h3 className="text-sm font-medium">Combustible</h3>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{tVales} <span className="text-sm font-normal text-slate-400">/ {totalChoferes}</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Banknote className="h-4 w-4" />
            <h3 className="text-sm font-medium">Anticipos</h3>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{tAnticipos} <span className="text-sm font-normal text-slate-400">/ {totalChoferes}</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <CheckCircle className="h-4 w-4" />
            <h3 className="text-sm font-medium">Pagos Finales</h3>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{tPagos} <span className="text-sm font-normal text-slate-400">/ {totalChoferes}</span></p>
        </div>
      </div>

      <Card>
        <CardHeader 
          titulo="Control de Choferes Activos" 
          extra={<span className="text-xs text-slate-500">{filtrados.length} encontrados</span>} 
        />
        
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por cédula o nombre..."
              className="pl-9 bg-white"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {paginados.length === 0 ? (
          <Vacio mensaje="No se encontraron choferes activos con esa búsqueda." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold min-w-[200px]">Chofer</th>
                  <th className="px-4 py-3 font-semibold min-w-[100px]">Tipo</th>
                  <th className="px-4 py-3 font-semibold min-w-[140px]">Contrato</th>
                  <th className="px-4 py-3 font-semibold min-w-[140px]">Combustible (Vale)</th>
                  <th className="px-4 py-3 font-semibold min-w-[140px]">Anticipo</th>
                  <th className="px-4 py-3 font-semibold min-w-[140px]">Pago Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginados.map((f) => (
                  <tr key={f.chofer_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/choferes/${f.chofer_id}`} className="font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                        {f.nombre_completo}
                      </Link>
                      <p className="text-xs tabular-nums text-slate-500 mt-0.5">
                        {formatearCI(f.ci)} · {f.candidato ?? "sin candidato"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {f.estado_servicio === 'voluntario' ? (
                        <Badge tono="neutro">Voluntario</Badge>
                      ) : f.estado_servicio === 'pendiente' ? (
                        <Badge tono="alerta">Pendiente</Badge>
                      ) : (
                        <Badge tono="info">Contratado</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.estado_servicio === 'voluntario' ? (
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">No aplica</span>
                      ) : f.contrato_firmado ? (
                        <Badge tono="ok"><span className="flex items-center w-full justify-center"><CheckCircle className="mr-1 h-3 w-3"/> Firmado</span></Badge>
                      ) : (
                        <AccionBoton accion={acciones.firmarContrato} chofer={f.chofer_id} texto="Marcar Firmado" icono={FileText} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.estado_servicio === 'voluntario' ? (
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">No aplica</span>
                      ) : f.vale_entregado ? (
                        <Badge tono="ok"><span className="flex items-center w-full justify-center"><CheckCircle className="mr-1 h-3 w-3"/> Entregado</span></Badge>
                      ) : (
                        <AccionBoton accion={acciones.entregarVale} chofer={f.chofer_id} texto="Entregar Vale" icono={Droplet}
                                  deshabilitado={!f.contrato_firmado}
                                  titulo={!f.contrato_firmado ? "Requiere contrato firmado" : undefined} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.estado_servicio === 'voluntario' ? (
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">No aplica</span>
                      ) : f.anticipo_pagado ? (
                        <Badge tono="ok"><span className="flex items-center w-full justify-center"><CheckCircle className="mr-1 h-3 w-3"/> Pagado</span></Badge>
                      ) : (
                        <AccionBoton accion={acciones.pagarAnticipo} chofer={f.chofer_id} texto="Pagar Anticipo" icono={Banknote}
                                  deshabilitado={!f.contrato_firmado}
                                  titulo={!f.contrato_firmado ? "Requiere contrato firmado" : undefined} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.estado_servicio === 'voluntario' ? (
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">No aplica</span>
                      ) : f.pago_finalizado ? (
                        <Badge tono="ok"><span className="flex items-center w-full justify-center"><CheckCircle className="mr-1 h-3 w-3"/> Finalizado</span></Badge>
                      ) : f.autorizado_por ? (
                        <AccionBoton accion={acciones.marcarPagoFinal} chofer={f.chofer_id} texto="Marcar Pagado" icono={CheckCircle} variant="default" />
                      ) : (
                        <AccionBoton accion={acciones.autorizarPago} chofer={f.chofer_id} texto="Autorizar" variant="secondary"
                                titulo={f.actividad === "activo"
                                  ? "Autorizar el pago final"
                                  : "Sin actividad: va a pedir una excepción"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t px-4 py-3 bg-slate-50 mt-auto">
              <div className="text-xs text-slate-500">
                Mostrando {(page - 1) * itemsPerPage + 1} a {Math.min(page * itemsPerPage, filtrados.length)} de {filtrados.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium text-slate-700">
                  {page} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
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
