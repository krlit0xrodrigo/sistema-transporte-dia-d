"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, claseInput } from "@/components/ui";
import { editarAsignacion } from "./actions";

export function EditarAsignacion({
  choferId,
  candidatoId,
  supervisorId,
  barrioId,
  estadoServicio,
  candidatos,
  supervisores,
  barrios,
}: {
  choferId: string;
  candidatoId: string;
  supervisorId: string | null;
  barrioId: string | null;
  estadoServicio: string;
  candidatos: { id: string; nombre_publico: string }[];
  supervisores: { id: string; alias: string }[];
  barrios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      candidato_id: formData.get("candidato_id") as string,
      supervisor_id: (formData.get("supervisor_id") as string) || null,
      barrio_id: (formData.get("barrio_id") as string) || null,
      estado_servicio: formData.get("estado_servicio") as "contratado" | "voluntario" | "pendiente",
    };

    if (!data.candidato_id) {
      setError("El candidato es obligatorio.");
      setGuardando(false);
      return;
    }

    const res = await editarAsignacion(choferId, data);
    if (res.ok) {
      setAbierto(false);
      router.refresh();
    } else {
      setError(res.error || "Error desconocido al guardar.");
    }
    setGuardando(false);
  }

  if (!abierto) {
    return (
      <Boton tipo="secundario" onClick={() => setAbierto(true)} className="w-full">
        Editar asignación
      </Boton>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border/50 bg-slate-50/50 p-4">
      <h3 className="mb-3 text-sm font-medium">Editar Asignación</h3>
      
      {error && <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Candidato" nombre="candidato_id" requerido>
          <select
            name="candidato_id"
            id="candidato_id"
            className={claseInput}
            defaultValue={candidatoId}
            required
          >
            <option value="">Seleccione un candidato</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_publico}
              </option>
            ))}
          </select>
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Supervisor" nombre="supervisor_id">
            <select
              name="supervisor_id"
              id="supervisor_id"
              className={claseInput}
              defaultValue={supervisorId || ""}
            >
              <option value="">(Ninguno)</option>
              {supervisores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.alias}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Barrio" nombre="barrio_id">
            <select
              name="barrio_id"
              id="barrio_id"
              className={claseInput}
              defaultValue={barrioId || ""}
            >
              <option value="">(Ninguno)</option>
              {barrios.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo etiqueta="Estado de servicio" nombre="estado_servicio" requerido>
          <select
            name="estado_servicio"
            id="estado_servicio"
            className={claseInput}
            defaultValue={estadoServicio}
            required
          >
            <option value="voluntario">voluntario</option>
            <option value="contratado">contratado</option>
            <option value="pendiente">pendiente</option>
          </select>
        </Campo>

        <div className="flex gap-2 pt-2">
          <Boton type="submit" disabled={guardando} className="flex-1">
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Boton>
          <Boton tipo="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </div>
  );
}
