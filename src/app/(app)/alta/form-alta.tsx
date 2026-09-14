"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  altaChoferSchema,
  type AltaChoferInput,
} from "@/lib/schemas/alta-chofer";
import { altaChofer, type AltaResult } from "./actions";
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

export function FormAlta({
  ciPrecargada,
  candidatos,
  barrios,
  supervisores,
  padron,
}: FormAltaProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  async function onSubmit(data: AltaChoferInput) {
    setServerError(null);

    const fd = new FormData();
    for (const [key, value] of Object.entries(data)) {
      fd.append(key, value ?? "");
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
      {serverError && (
        <Aviso tono="error">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        </Aviso>
      )}

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
              <Input
                id="ci"
                inputMode="numeric"
                placeholder="4361034"
                autoFocus={!ciPrecargada}
                {...register("ci")}
                className={cn(errors.ci && "border-destructive")}
              />
              <FieldError error={errors.ci?.message} />
              {padron && (
                <div className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                  padron.encontrado
                    ? "bg-success-50 text-success"
                    : "bg-warning-50 text-warning",
                )}>
                  {padron.encontrado ? (
                    <><CheckCircle className="h-3 w-3" /> En el padrón: {padron.nombre_completo}</>
                  ) : (
                    <><AlertTriangle className="h-3 w-3" /> No figura en el padrón de Villa Hayes</>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Solo números. Se verifica contra el padrón y la lista negra.
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
