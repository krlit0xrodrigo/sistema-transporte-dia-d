/**
 * Tipos del subconjunto del esquema que usa la aplicación.
 *
 * Cuando el proyecto esté enlazado conviene reemplazarlos por los
 * generados:  supabase gen types typescript --linked > src/types/database.ts
 */

export type EstadoIdentidad = "verificada" | "fuera_de_padron" | "discrepancia_nombre";
export type EstadoServicio = "contratado" | "voluntario" | "pendiente";
export type EstadoChofer = "borrador" | "activo" | "suspendido" | "baja";
export type Actividad = "activo" | "inactivo" | "sin_dispositivo" | "sin_datos";
export type CupoAmbito = "candidato" | "barrio" | "supervisor" | "global";

export interface FichaChofer {
  chofer_id: string;
  persona_id: string;
  ci: string;
  nombre_completo: string;
  telefono_e164: string | null;
  verificado_en_padron: boolean;
  estado_identidad: EstadoIdentidad;
  estado: EstadoChofer;
  estado_servicio: EstadoServicio;
  candidato: string | null;
  barrio: string | null;
  supervisor: string | null;
  responsable: string | null;
  responsable_tipo: string | null;
  chapa: string | null;
  categoria: string | null;
  apariciones: number;
  contrato_firmado: boolean | null;
  vale_entregado: boolean | null;
  anticipo_pagado: boolean | null;
  pago_finalizado: boolean | null;
  actividad: Actividad | null;
  km_recorridos: string | null;
}

export interface CupoConsumo {
  id: string;
  ambito: CupoAmbito;
  etiqueta: string;
  limite: number;
  usado: number;
  disponible: number;
  porcentaje: string;
  candidato_id: string | null;
  barrio_id: string | null;
  supervisor_id: string | null;
}

export interface Catalogo { id: string; nombre: string }

export interface ResultadoPadron {
  encontrado: boolean;
  ci: string;
  nombre_completo: string | null;
  nombres?: string | null;
  apellidos?: string | null;
  local_nombre: string | null;
  mesa: number | null;
  orden: number | null;
  direccion: string | null;
  partidos: string | null;
  seccional: string | null;
  historial_votacion: { eleccion_codigo: string; voto: string }[] | null;
}

export interface Aparicion {
  numero_fila: number | null;
  hoja: string | null;
  nombre_texto: string | null;
  candidato_texto: string | null;
  barrio_texto: string | null;
  fue_aplicada: boolean;
}

export interface Antecedente {
  resultado: string;
  km_recorridos: string | null;
  tuvo_gps: boolean;
  confiabilidad_dato: string;
  fuente: string | null;
  eleccion_id: string;
}
