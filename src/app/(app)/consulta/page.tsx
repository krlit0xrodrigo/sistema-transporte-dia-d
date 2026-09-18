import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Buscador } from "@/components/buscador";
import { Search, User, Shield, FileText, History } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consulta",
};

/**
 * PUERTA 1 — ¿Quién es esta persona?
 *
 * CI → Persona → Padrón → Antecedentes → Lista negra → Historial
 *
 * El resultado navega a /consulta/[ci] que muestra la ficha completa.
 * La consulta al padrón queda registrada en accesos_sensibles.
 */
export default function ConsultaPage() {
  return (
    <div className="space-y-6">
      <PageHeader descripcion="Buscar por CI, nombre o apellido. La consulta al padrón queda registrada.">
        Consulta de persona
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <Buscador autoFocus destino="consulta" ambito="operativo" />
        </CardContent>
      </Card>

      {/* Guía visual de lo que muestra la ficha */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={User}
          titulo="Datos personales"
          descripcion="CI, nombre, apellido, teléfono, estado de identidad"
        />
        <InfoCard
          icon={Search}
          titulo="Padrón electoral"
          descripcion="Local de votación, mesa, orden. ¿Está en Villa Hayes?"
        />
        <InfoCard
          icon={History}
          titulo="Antecedentes"
          descripcion="Participación en elecciones anteriores, resultado, kilómetros"
        />
        <InfoCard
          icon={Shield}
          titulo="Estado operativo"
          descripcion="Lista negra, excepciones, asignación actual, caja"
        />
      </div>

      <div className="rounded-lg border border-dashed p-8 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">
          Buscá una persona por cédula, nombre o apellido para ver su ficha completa.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          La ficha muestra todo sobre esa persona: padrón, antecedentes, lista negra,
          operación actual y caja — sin mezclar histórico con operación.
        </p>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  titulo,
  descripcion,
}: {
  icon: React.ElementType;
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
      </div>
    </div>
  );
}
