"use client";

import { useTransition, useState } from "react";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boton, Card, CardHeader } from "@/components/ui";
import { ShieldAlert, History } from "lucide-react";
import { revocarListaNegra } from "@/lib/acciones";

interface Entrada {
  id: string; ci: string; nombre_completo: string;
  motivo_codigo: string; motivo_detalle: string | null; severidad: string;
  vigente_desde: string; vigente_hasta: string | null;
  revocado_en: string | null; motivo_revocacion: string | null; vigente: boolean;
}

interface AntecedenteNegativo {
  ci: string;
  nombre_completo: string;
  candidato: string;
  supervisor: string;
  resultado: string;
  eleccion_nombre: string;
}

const MOTIVOS: Record<string, string> = {
  incumplio_operativo: "Incumplió el operativo",
  cobro_sin_servicio: "Cobró sin prestar servicio",
  documentacion_falsa: "Documentación falsa",
  vehiculo_no_habilitado: "Vehículo no habilitado",
  conducta: "Conducta",
  doble_imputacion: "Doble imputación entre candidatos",
  a_pedido_de_la_persona: "A pedido de la persona",
  otro: "Otro (requiere detalle)"
};

export function ListaNegraClient({ 
  entradas, 
  antecedentes 
}: { 
  entradas: Entrada[]; 
  antecedentes: AntecedenteNegativo[]; 
}) {
  const [isPending, startTransition] = useTransition();

  const handleRevocar = (id: string) => {
    const motivo = prompt("Motivo para revocar este bloqueo:");
    if (!motivo) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("motivo_revocacion", motivo);
      await revocarListaNegra(fd);
    });
  };

  const columnasListaNegra: Column<Entrada>[] = [
    { key: "ci", header: "CI", cell: (r) => <span className="font-mono text-xs">{r.ci}</span> },
    { key: "nombre", header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre_completo}</span> },
    { 
      key: "motivo", header: "Motivo", 
      cell: (r) => (
        <div className="flex flex-col">
          <span>{MOTIVOS[r.motivo_codigo] || r.motivo_codigo}</span>
          {r.motivo_detalle && <span className="text-xs text-muted-foreground">{r.motivo_detalle}</span>}
        </div>
      )
    },
    { 
      key: "estado", header: "Estado", 
      cell: (r) => (
        r.vigente 
          ? <Badge variant="danger">Bloqueado</Badge> 
          : <Badge variant="success">Revocado</Badge>
      )
    },
    { 
      key: "acciones", header: "Acciones", 
      cell: (r) => r.vigente && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRevocar(r.id)} disabled={isPending}>
          Revocar
        </Button>
      )
    }
  ];

  const columnasAntecedentes: Column<AntecedenteNegativo>[] = [
    { key: "ci", header: "CI", cell: (r) => <span className="font-mono text-xs">{r.ci}</span> },
    { key: "nombre", header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre_completo}</span> },
    { key: "candidato", header: "Candidato", cell: (r) => <span className="text-muted-foreground">{r.candidato || "—"}</span> },
    { key: "supervisor", header: "Supervisor", cell: (r) => <span className="text-muted-foreground">{r.supervisor || "—"}</span> },
    { 
      key: "eleccion", header: "Elección", 
      cell: (r) => <span className="text-xs font-medium text-slate-500">{r.eleccion_nombre}</span> 
    }
  ];

  return (
    <div className="space-y-12">
      {/* Lista Negra Vigente */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-semibold text-slate-800">Personas en Lista Negra</h2>
        </div>
        <DataTable 
          data={entradas} 
          columns={columnasListaNegra} 
          searchPlaceholder="Buscar por cédula o nombre en lista negra..."
          filasPorPagina={15}
        />
      </section>

      {/* Antecedentes Negativos */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2 mt-12">
          <History className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Personas que No Cumplieron</h2>
        </div>
        <p className="text-sm text-slate-500 max-w-3xl">
          Este listado agrupa a todas las personas que, según los archivos históricos, tienen resultado <strong>"no cumplió"</strong> en elecciones previas. 
          Al igual que la lista negra, si intentas registrar a alguna de estas personas, el sistema requerirá una excepción explícita.
        </p>
        <DataTable 
          data={antecedentes} 
          columns={columnasAntecedentes} 
          searchPlaceholder="Buscar por cédula, nombre o candidato en antecedentes..."
          filasPorPagina={15}
        />
      </section>
    </div>
  );
}
