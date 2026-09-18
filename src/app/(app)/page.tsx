import Link from "next/link";
import { crearClienteServidor, crearClienteAdmin } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Vacio } from "@/components/shared";
import { 
  Users, CheckCircle, AlertTriangle, Gauge, 
  FileSignature, Fuel, ShieldAlert, ShieldCheck, ClipboardList, LayoutList 
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
  const supabaseAdmin = crearClienteAdmin();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: userRoles } = await supabase
    .from("usuario_roles")
    .select("roles!inner(codigo)")
    .eq("usuario_id", user?.id) as { data: { roles: { codigo: string } }[] | null };
  const roles = userRoles?.map(r => r.roles.codigo) || [];
  const esConsulta = roles.includes("consulta");
  const esTerritorial = roles.includes("candidato") || roles.includes("concejal");
  const dbActual = (esConsulta && !esTerritorial) ? supabaseAdmin : supabase;

  const { data: scope } = await supabase
    .from("usuario_scopes")
    .select("*")
    .eq("usuario_id", user?.id)
    .maybeSingle();

  const { data: puedeGestionarCupos } = await supabase.rpc('auth_tiene_permiso', { p_codigo: 'cupos.definir' });

  const { data: eleccion } = await supabase
    .from("elecciones")
    .select("id")
    .eq("estado", "activa")
    .single();

  let qCupos = supabaseAdmin.from("v_cupos_consumo")
    .select("*")
    .eq("eleccion_id", eleccion?.id || "")
    .order("porcentaje", { ascending: false });

  if (scope) {
    if (scope.candidato_id) {
      const { data: supervisores } = await supabase.from("supervisores").select("id").eq("candidato_id", scope.candidato_id);
      const superIds = supervisores?.map(s => s.id) || [];
      if (superIds.length > 0) {
        qCupos = qCupos.or(`candidato_id.eq.${scope.candidato_id},supervisor_id.in.(${superIds.join(',')})`);
      } else {
        qCupos = qCupos.eq("candidato_id", scope.candidato_id);
      }
    } else if (scope.supervisor_id) {
      qCupos = qCupos.eq("supervisor_id", scope.supervisor_id);
    } else if (scope.barrio_id) {
      qCupos = qCupos.eq("barrio_id", scope.barrio_id);
    }
  }

  // Queries base (Dashboard General)
  const [
    { count: choferes }, 
    { count: verificados }, 
    { count: conflictos }, 
    { data: cupos }
  ] = await Promise.all([
    dbActual.from("choferes").select("*", { count: "exact", head: true }).eq("eleccion_id", eleccion?.id || "").eq("estado", "activo").is("origen_planilla_id", null),
    dbActual.from("choferes").select("personas!inner(id)", { count: "exact", head: true }).eq("eleccion_id", eleccion?.id || "").eq("estado", "activo").is("origen_planilla_id", null).eq("personas.estado_identidad", "verificada"),
    esTerritorial ? Promise.resolve({ count: 0 }) : supabaseAdmin.from("importacion_filas").select("*", { count: "exact", head: true }).eq("estado", "conflicto"),
    qCupos,
  ]);

  // Queries Fase 7 (Control Financiero y Seguridad)
  const [
    { count: contratosFirmados },
    { count: valesEntregados },
    { count: listaNegraActiva },
    { count: excepcionesPendientes },
    { data: dataCaja },
  ] = await Promise.all([
    dbActual.from("contratos").select("*", { count: "exact", head: true }).eq("estado", "firmado"),
    dbActual.from("vales_combustible").select("*", { count: "exact", head: true }).eq("estado", "entregado"),
    esTerritorial ? Promise.resolve({ count: 0 }) : dbActual.from("v_lista_negra").select("*", { count: "exact", head: true }).eq("activo", true),
    esTerritorial ? Promise.resolve({ count: 0 }) : dbActual.from("v_excepciones").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
    dbActual.from("v_caja").select("candidato, supervisor, barrio").eq("eleccion_id", eleccion?.id),
  ]);

  const lista = (cupos ?? []) as CupoConsumo[];
  const choferesEstructura = (dataCaja ?? []) as any[];

  const contarPor = (campo: string) => {
    const conteo = choferesEstructura.reduce((acc, ch) => {
      const val = ch[campo] || "Sin Asignar";
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(conteo).sort((a, b) => (b[1] as number) - (a[1] as number));
  };

  const topCandidatos = contarPor("candidato");
  const topSupervisores = contarPor("supervisor");
  const topBarrios = contarPor("barrio");

  return (
    <div className="space-y-6 pb-12">
      <PageHeader descripcion="Día D — Municipales Villa Hayes · 4 de octubre de 2026">
        Dashboard General
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard valor={choferes ?? 0} etiqueta="Choferes activos" icon={Users} href="/choferes" />
        <StatCard valor={verificados ?? 0} etiqueta="Padrón cruzado" detalle="Nuevos choferes verificados" icon={CheckCircle} href="/consulta" />
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
            {puedeGestionarCupos && (
              <Button variant="link" size="sm" asChild>
                <Link href="/cupos">Gestionar cupos</Link>
              </Button>
            )}
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

      <h2 className="text-lg font-semibold tracking-tight mt-10 mb-4 border-b pb-2">Estructura Operativa (Choferes)</h2>
      
      <div className="grid gap-6 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              Por Candidato
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCandidatos.length === 0 ? (
              <Vacio mensaje="Sin datos" />
            ) : (
              <ul className="divide-y text-sm">
                {topCandidatos.map(([nombre, cant]) => (
                  <li key={nombre} className="flex justify-between py-2">
                    <span className="text-slate-700 truncate pr-2">{nombre}</span>
                    <span className="font-semibold tabular-nums">{cant as React.ReactNode}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-slate-500" />
              Por Supervisor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSupervisores.length === 0 ? (
              <Vacio mensaje="Sin datos" />
            ) : (
              <ul className="divide-y text-sm">
                {topSupervisores.map(([nombre, cant]) => (
                  <li key={nombre} className="flex justify-between py-2">
                    <span className="text-slate-700 truncate pr-2">{nombre}</span>
                    <span className="font-semibold tabular-nums">{cant as React.ReactNode}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="h-4 w-4 text-slate-500" />
              Por Barrio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topBarrios.length === 0 ? (
              <Vacio mensaje="Sin datos" />
            ) : (
              <ul className="divide-y text-sm">
                {topBarrios.map(([nombre, cant]) => (
                  <li key={nombre} className="flex justify-between py-2">
                    <span className="text-slate-700 truncate pr-2">{nombre}</span>
                    <span className="font-semibold tabular-nums">{cant as React.ReactNode}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
