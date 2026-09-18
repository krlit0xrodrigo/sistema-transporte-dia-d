/**
 * Schema de validación para alta de chofer.
 *
 * Las validaciones pesadas (padrón, lista negra, cupo, duplicado)
 * viven en la transacción de fn_alta_chofer — nunca se replican acá.
 * Este schema valida lo que el formulario puede verificar sin servidor.
 */

import { z } from "zod";

export const altaChoferSchema = z.object({
  ci: z
    .string()
    .min(1, "La cédula es obligatoria.")
    .regex(/^\d+$/, "Solo números, sin puntos ni guiones.")
    .min(3, "Cédula demasiado corta.")
    .max(10, "Cédula demasiado larga."),
  nombres: z
    .string()
    .min(1, "El nombre es obligatorio.")
    .max(100, "Nombre demasiado largo."),
  apellidos: z
    .string()
    .max(100, "Apellido demasiado largo.")
    .optional()
    .or(z.literal("")),
  telefono: z
    .string()
    .max(20, "Teléfono demasiado largo.")
    .optional()
    .or(z.literal("")),
  candidato_id: z
    .string()
    .min(1, "Elegí un candidato."),
  barrio_id: z
    .string()
    .optional()
    .or(z.literal("")),
  supervisor_id: z
    .string()
    .optional()
    .or(z.literal("")),
  estado_servicio: z
    .enum(["contratado", "voluntario", "pendiente"], {
      errorMap: () => ({ message: "Elegí un estado de servicio." }),
    }),
  chapa: z
    .string()
    .max(20, "Chapa demasiado larga.")
    .optional()
    .or(z.literal("")),
  categoria: z
    .enum(["", "automovil", "camioneta", "minibus", "motocicleta"])
    .optional(),
  marca: z
    .string()
    .max(50, "Marca demasiado larga.")
    .optional()
    .or(z.literal("")),
  modelo: z
    .string()
    .max(50, "Modelo demasiado largo.")
    .optional()
    .or(z.literal("")),
  aprobar_lista_negra: z.boolean().optional(),
  motivo_excepcion: z.string().optional(),
});

export type AltaChoferInput = z.infer<typeof altaChoferSchema>;

/** Mensajes de error del servidor (fn_alta_chofer). */
export const ERRORES_SERVIDOR: Record<string, string> = {
  CI_OBLIGATORIO: "La cédula es obligatoria y debe ser numérica.",
  RESPONSABLE_OBLIGATORIO: "Indicá el supervisor o concejal que responde por este chofer.",
  CHOFER_DUPLICADO: "Esa cédula ya tiene una participación activa en esta elección.",
  LISTA_NEGRA: "La persona está en lista negra. Requiere una excepción aprobada.",
  CUPO_AGOTADO: "El cupo está agotado. Solicitá una excepción para avanzar.",
  SIN_PERMISO: "Tu usuario no tiene permiso para dar de alta choferes.",
  MOTIVO_OBLIGATORIO: "Debes ingresar un motivo para justificar esta alta bajo tu responsabilidad.",
};

export function traducirErrorServidor(mensaje: string): string {
  for (const [codigo, texto] of Object.entries(ERRORES_SERVIDOR)) {
    if (mensaje.includes(codigo)) {
      if (codigo === "CUPO_AGOTADO" || codigo === "CHOFER_DUPLICADO") {
        const extra = mensaje.split(`${codigo}:`)[1]?.trim();
        return extra ? `${texto} (${extra})` : texto;
      }
      return texto;
    }
  }
  return mensaje;
}
