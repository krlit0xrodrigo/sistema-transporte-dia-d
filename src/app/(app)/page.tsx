import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Vacio } from "@/components/shared";
import { 
  Users, CheckCircle, AlertTriangle, Gauge, 
  FileSignature, Fuel, ShieldAlert, ShieldCheck, ClipboardList 
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface CupoConsumo {
  id: string;
  etiqueta: string;
  ambito: string;
  limite: number;
  usado: number;
  porcentaje: number;
}

function StatCard({
  valor,
  etiqueta,
  detalle,
  icon: Icon,
  href,
}: {
  valor: number | string;
  etiqueta: string;
  detalle?: string;
  icon: React.ElementType;
  href?: string;
}) {
  const content = (
    <Card className={`h-full ${href ? "hover:bg-slate-50 transition-colors" : ""}`}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums">{valor}</p>
          <p className="text-sm font-medium text-muted-foreground">{etiqueta}</p>
          {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href} className="block">{content}</Link> : content;
}

function semaforo(pct: number) {
  if (pct >= 100) return { variant: "danger" as const, texto: "Agotado" };
  if (pct >= 80) return { variant: "warning" as const, texto: "Al límite" };
  return { variant: "success" as const, texto: "Disponible" };
}

export default async function Tablero() {
  const supabase = await crearClienteServidor();

  // Queries base
  const [
    { count: choferes }, 
    { count: verificados }, 
    { count: conflictos }, 
    { data: cupos }
  ] = await Promise.all([
    supabase.from("choferes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
    supabase.from("personas").select("*", { count: "exact", head: true }).eq("estado_identidad", "verificada"),
    supabase.from("importacion_filas").select("*", { count: "exact", head: true }).eq("estado", "conflicto"),
    supabase.from("v_cupos_consumo").select("*").order("porcentaje", { ascending: false }),
  ]);

  // Queries Fase 7
  const [
    { count: ordenesEmitidas },
    { count: contratosFirmados },
    { count: valesEntregados },
    { count: listaNegraActiva },
    { count: excepcionesPendientes },
  ] = await Promise.all([
    supabase.from("choferes").select("*", { count: "exact", head: true }).not("numero_orden", "is", null).eq("estado", "activo"),
    supabase.from("contratos").select("*", { count: "exact", head: true }).eq("estado", "firmado"),
    supabase.from("vales_combustible").select("*", { count: "exact", head: true }).eq("estado", "entregado"),
    supabase.from("v_lista_negra").select("*", { count: "exact", head: true }).eq("activo", true),
    supabase.from("v_excepciones").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
  ]);

  const lista = (cupos ?? []) as CupoConsumo[];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader descripcion="Día D — Municipales Villa Hayes · 4 de octubre de 2026">
        Dashboard General
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard valor={choferes ?? 0} etiqueta="Choferes activos" icon={Users} href="/choferes" />
        <StatCard valor={ordenesEmitidas ?? 0} etiqueta="Órdenes asignadas" icon={ClipboardList} href="/ordenes" />
        <StatCard valor={verificados ?? 0} etiqueta="Padrón cruzado" detalle="Identidades verificadas" icon={CheckCircle} href="/consulta" />
        <StatCard valor={conflictos ?? 0} etiqueta="Filas en conflicto" detalle="En proceso de importación" icon={AlertTriangle} />
      </div>

      <h2 className="text-lg font-semibold tracking-tight mt-8 mb-4 border-b pb-2">Control Financiero y Seguridad</h2>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard valor={contratosFirmados ?? 0} etiqueta="Contratos firmados" icon={FileSignature} href="/contratos" />
        <StatCard valor={valesEntregados ?? 0} etiqueta="Vales entregados" icon={Fuel} href="/combustible" />
        <StatCard valor={listaNegraActiva ?? 0} etiqueta="Lista Negra activa" detalle="Choferes inhabilitados" icon={ShieldAlert} href="/lista-negra" />
        <StatCard valor={excepcionesPendientes ?? 0} etiqueta="Excepciones" detalle="Pendientes de revisión" icon={ShieldCheck} href="/excepciones" />
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Estado de Cupos por Ámbito
            </CardTitle>
            <Button variant="link" size="sm" asChild>
              <Link href="/cupos">Gestionar cupos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {lista.length === 0 ? (
              <Vacio mensaje="Todavía no hay cupos definidos. Sin cupo, ningún ámbito restringe el alta." />
            ) : (
              <ul className="divide-y border-t mt-2">
                {lista.slice(0, 12).map((c) => {
                  const pct = Number(c.porcentaje);
                  const s = semaforo(pct);
                  return (
                    <li key={c.id} className="flex items-center gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.etiqueta}</p>
                        <p className="text-xs text-muted-foreground">{c.ambito}</p>
                      </div>
                      <div className="hidden sm:block h-2 w-32 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full transition-all ${
                            pct >= 100
                              ? "bg-danger"
                              : pct >= 80
                                ? "bg-warning"
                                : "bg-success"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                        {c.usado} / {c.limite}
                      </span>
                      <Badge variant={s.variant}>{s.texto}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
