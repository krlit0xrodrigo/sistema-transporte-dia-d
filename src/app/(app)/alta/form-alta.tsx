"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  altaChoferSchema,
  type AltaChoferInput,
} from "@/lib/schemas/alta-chofer";
import { altaChofer, solicitarExcepcion, consultarDatosChofer, type AltaResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Aviso } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  User, MapPin, Car, Loader2, AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface Catalogo {
  id: string;
  nombre: string;
}

interface FormAltaProps {
  ciPrecargada: string;
  candidatos: Catalogo[];
  barrios: Catalogo[];
  supervisores: Catalogo[];
  /** Datos del padrón si se encontró la CI precargada. */
  padron?: {
    encontrado: boolean;
    nombre_completo: string | null;
  } | null;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {error}
    </p>
  );
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12
};

function getEleccionScore(codigo: string) {
  const m = codigo.substring(0, 3).toLowerCase();
  const y = parseInt(codigo.substring(3), 10) || 0;
  const mes = MESES[m] || 0;
  return y * 100 + mes;
}

export function FormAlta({
  ciPrecargada,
  candidatos,
  barrios,
  supervisores,
  padron,
}: FormAltaProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [excepcionSolicitada, setExcepcionSolicitada] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Estados interactivos para consulta
  const [isFetching, setIsFetching] = useState(false);
  const [fetchedPadron, setFetchedPadron] = useState<any>(null);
  const [fetchedAntecedentes, setFetchedAntecedentes] = useState<any[]>([]);
  const [consultaRealizada, setConsultaRealizada] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<AltaChoferInput>({
    resolver: zodResolver(altaChoferSchema),
    defaultValues: {
      ci: ciPrecargada,
      nombres: "",
      apellidos: "",
      telefono: "",
      candidato_id: "",
      barrio_id: "",
      supervisor_id: "",
      estado_servicio: "contratado",
      chapa: "",
      categoria: "",
      marca: "",
      modelo: "",
    },
  });

  const ci = watch("ci");

  async function handleConsultar() {
    if (!ci) return;
    setIsFetching(true);
    setConsultaRealizada(false);
    setFetchedPadron(null);
    setFetchedAntecedentes([]);

    try {
      const res = await consultarDatosChofer(ci);
      if (res.ok) {
        setFetchedPadron(res.padron);
        setFetchedAntecedentes(res.antecedentes || []);
        
        if (res.padron) {
          if (res.padron.nombres) setValue("nombres", res.padron.nombres);
          if (res.padron.apellidos) setValue("apellidos", res.padron.apellidos);
        }
      }
    } catch (err) {
      console.error("Error consultando chofer:", err);
    } finally {
      setIsFetching(false);
      setConsultaRealizada(true);
    }
  }

  async function onSubmit(data: AltaChoferInput) {
    setServerError(null);

    const fd = new FormData();
    for (const [key, value] of Object.entries(data)) {
      fd.append(key, typeof value === 'boolean' ? value.toString() : (value ?? ""));
    }

    startTransition(async () => {
      try {
        const result = await altaChofer(fd);
        // If redirect didn't happen, there was an error
        if (!result.ok && result.error) {
          setServerError(result.error);
        }
      } catch {
        // redirect() throws in server actions — that's normal
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">


      {/* ═══════ IDENTIDAD ═══════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            Identidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ci">
                Cédula <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="ci"
                  inputMode="numeric"
                  placeholder="4361034"
                  autoFocus={!ciPrecargada}
                  {...register("ci")}
                  className={cn(errors.ci && "border-destructive")}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConsultar();
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handleConsultar}
                  disabled={isFetching || !ci}
                >
                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ok"}
                </Button>
              </div>
              <FieldError error={errors.ci?.message} />

              {/* Resultado interactivo */}
              {consultaRealizada && (
                <div className="mt-2 space-y-2">
                  {fetchedPadron ? (
                    <div className="rounded-md bg-success-50 p-2 text-xs text-success-800">
                      <div className="flex items-center gap-1.5 font-medium mb-1">
                        <CheckCircle className="h-3.5 w-3.5 text-success" /> 
                        En el padrón: {fetchedPadron.nombre_completo}
                      </div>
                      <div className="ml-5 space-y-0.5 text-success-700/80">
                        {fetchedPadron.local_nombre && (
                          <p><strong>Local:</strong> {fetchedPadron.local_nombre}</p>
                        )}
                        {(fetchedPadron.mesa || fetchedPadron.orden) && (
                          <p><strong>Mesa:</strong> {fetchedPadron.mesa} • <strong>Orden:</strong> {fetchedPadron.orden}</p>
                        )}
                        
                        {fetchedPadron.historial_votacion && fetchedPadron.historial_votacion.length > 0 && (
                          <div className="pt-1.5 mt-1 border-t border-success-200/50">
                            <p className="font-semibold text-[10px] uppercase tracking-wider text-success-800/70 mb-1">
                              Historial de Votación
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {[...fetchedPadron.historial_votacion]
                                .sort((a, b) => getEleccionScore(b.eleccion_codigo) - getEleccionScore(a.eleccion_codigo))
                                .map(v => (
                                <div key={v.eleccion_codigo} className="flex items-center gap-1 bg-white/60 px-1.5 py-0.5 rounded text-[10px] font-medium border border-success-200/40">
                                  <span className="text-success-800/80">{v.eleccion_codigo.toUpperCase()}:</span>
                                  <span className={v.voto === 'S' ? 'text-success font-bold' : 'text-destructive font-bold'}>
                                    {v.voto === 'S' ? 'SI' : 'NO'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md bg-warning-50 px-2 py-1.5 text-xs text-warning-800">
                      <AlertTriangle className="h-3 w-3 text-warning" /> No figura en el padrón
                    </div>
                  )}

                  {fetchedAntecedentes.length > 0 && (
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-2 text-xs">
                      <p className="font-medium text-slate-700 mb-1 flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Antecedentes registrados
                      </p>
                      <ul className="space-y-1.5 ml-1">
                        {fetchedAntecedentes.map((ant, idx) => {
                            const detallesHist = [
                              ant.candidato_historico ? `Candidato: ${ant.candidato_historico}` : null,
                              ant.supervisor_historico ? `Supervisor: ${ant.supervisor_historico}` : null,
                              ant.barrio_historico ? `Barrio: ${ant.barrio_historico}` : null,
                            ].filter(Boolean).join(" - ");

                            return (
                              <li key={idx} className="text-slate-600 border-l-2 border-slate-300 pl-2">
                                <strong>{ant.eleccion_nombre}:</strong> Rol {ant.rol}, Estado:{" "}
                                <span className={
                                  ant.resultado === "cumplio" ? "text-success font-medium" : 
                                  ant.resultado === "no_cumplio" ? "text-destructive font-medium" : ""
                                }>
                                  {ant.resultado}
                                </span>
                                {detallesHist && <p className="text-slate-500 mt-0.5 text-[10px]">{detallesHist}</p>}
                                {ant.incidentes && <p className="text-destructive mt-0.5 text-[10px]">Nota: {ant.incidentes}</p>}
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {/* Fallback original si venía por URL (ignorado si ya hizo interactivo) */}
              {padron && !consultaRealizada && (
                <div className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                  padron.encontrado
                    ? "bg-success-50 text-success"
                    : "bg-warning-50 text-warning",
                )}>
                  {padron.encontrado ? (
                    <><CheckCircle className="h-3 w-3" /> En el padrón: {padron.nombre_completo}</>
                  ) : (
                    <><AlertTriangle className="h-3 w-3" /> No figura en el padrón</>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Presiona "Ok" para buscar datos.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                inputMode="tel"
                placeholder="0992 511-770"
                {...register("telefono")}
              />
              <FieldError error={errors.telefono?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombres">
                Nombres <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nombres"
                placeholder="Daniel"
                {...register("nombres")}
                className={cn(errors.nombres && "border-destructive")}
              />
              <FieldError error={errors.nombres?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apellidos">Apellidos</Label>
              <Input
                id="apellidos"
                placeholder="Britez"
                {...register("apellidos")}
              />
              <FieldError error={errors.apellidos?.message} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ ASIGNACIÓN ═══════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Asignación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="candidato_id">
                Candidato <span className="text-destructive">*</span>
              </Label>
              <select
                id="candidato_id"
                {...register("candidato_id")}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  errors.candidato_id && "border-destructive",
                )}
              >
                <option value="">Elegí un candidato</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <FieldError error={errors.candidato_id?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barrio_id">Barrio</Label>
              <select
                id="barrio_id"
                {...register("barrio_id")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sin barrio</option>
                {barrios.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supervisor_id">Supervisor</Label>
              <select
                id="supervisor_id"
                {...register("supervisor_id")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sin supervisor</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Si no hay supervisor, responde el concejal (RN-16).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estado_servicio">Estado de servicio</Label>
              <select
                id="estado_servicio"
                {...register("estado_servicio")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="contratado">Contratado</option>
                <option value="voluntario">Voluntario</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ VEHÍCULO ═══════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Car className="h-4 w-4 text-muted-foreground" />
            Vehículo
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">opcional</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="chapa">Chapa</Label>
              <Input id="chapa" placeholder="ABC 123" {...register("chapa")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria">Categoría</Label>
              <select
                id="categoria"
                {...register("categoria")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">—</option>
                <option value="automovil">Automóvil</option>
                <option value="camioneta">Camioneta</option>
                <option value="minibus">Minibús</option>
                <option value="motocicleta">Motocicleta</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="marca">Marca</Label>
              <Input id="marca" placeholder="Toyota" {...register("marca")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modelo">Modelo</Label>
              <Input id="modelo" placeholder="Hilux" {...register("modelo")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ SUBMIT ═══════ */}
      {serverError && !excepcionSolicitada && (
        <Aviso tono="error">
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
            
            {(serverError.includes("lista negra") || serverError.includes("antecedentes negativos") || serverError.includes("MOTIVO_OBLIGATORIO")) && (
              <div className="mt-2 rounded-md bg-white/50 p-3">
                <p className="text-sm font-medium mb-2 text-slate-800">Aprobar alta bajo tu responsabilidad</p>
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="aprobar_lista_negra"
                      className="h-4 w-4 rounded border-gray-300 text-rojo-600 focus:ring-rojo-500"
                      {...register("aprobar_lista_negra")}
                    />
                    <label htmlFor="aprobar_lista_negra" className="text-sm text-slate-700">
                      Confirmo que deseo forzar el alta a pesar de los antecedentes.
                    </label>
                  </div>
                  <div>
                    <Input 
                      id="motivo_excepcion" 
                      placeholder="Escribí el motivo para justificar el alta..." 
                      className="h-8 text-xs bg-white w-full"
                      {...register("motivo_excepcion")}
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Marcá la casilla, escribí el motivo y volvé a presionar "Dar de alta".
                </p>
              </div>
            )}

            {(serverError.includes("agotado")) && (
              <div className="mt-2 rounded-md bg-white/50 p-3">
                <p className="text-sm font-medium mb-2 text-slate-800">Solicitar excepción de cupo</p>
                <div className="flex gap-2">
                  <Input id="motivo_excepcion_input" placeholder="Justificación de la excepción..." className="h-8 text-xs bg-white" />
                  <Button type="button" size="sm" className="h-8 text-xs whitespace-nowrap" onClick={() => {
                    const input = document.getElementById("motivo_excepcion_input") as HTMLInputElement;
                    if (!input || !input.value.trim()) {
                      alert("Por favor ingresa una justificación.");
                      return;
                    }
                    const fd = new FormData();
                    fd.append("ci", ci);
                    fd.append("tipo_excepcion", "cupo");
                    fd.append("motivo_excepcion", input.value.trim());
                    
                    startTransition(async () => {
                      const res = await solicitarExcepcion(fd);
                      if (res.ok) {
                        setExcepcionSolicitada(true);
                        setServerError(null);
                      } else {
                        setServerError(res.error || "Error al solicitar excepción");
                      }
                    });
                  }}>
                    Solicitar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Aviso>
      )}

      {excepcionSolicitada && (
        <Aviso tono="ok">
          <div className="flex items-start gap-2">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Excepción solicitada exitosamente. Debes esperar a que un aprobador la revise.</span>
          </div>
        </Aviso>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
          ) : (
            "Dar de alta"
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Se verifica padrón, lista negra y cupo antes de crear.
        </p>
      </div>
    </form>
  );
}
