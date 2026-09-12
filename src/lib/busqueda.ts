/**
 * Búsqueda de personas — el corazón operativo del sistema.
 *
 * REGLAS, Y POR QUÉ
 * -----------------
 * · **Cédula: normalizada, coincidencia por prefijo o exacta.**
 *   `4.361.034` y `4361034` son la misma cédula. La normalización replica
 *   exactamente `fn_normalizar_ci` de PostgreSQL —quitar el `.0` que deja
 *   Excel, quitar todo lo que no sea dígito, quitar ceros a la izquierda—
 *   para que el navegador y la base nunca discrepen sobre qué cédula es.
 *
 * · **Nombre y apellido: coincidencia EXACTA, sensible a mayúsculas y a
 *   acentos.** `José` no es `Jose` y `GAMARRA` no es `Gamarra`. Es la regla
 *   que pidió el operativo y tiene sentido: los nombres se guardan
 *   capitalizados (`Daniel Britez`), así que escribir `Carlos` encuentra a
 *   los Carlos y no a los 40 que llevan «Carlos» en algún lugar del nombre
 *   completo. La búsqueda parcial existe, pero es una decisión explícita
 *   del usuario, nunca el comportamiento por defecto.
 *
 * · **Nada se busca hasta que hay algo que buscar.** Sin término, cero
 *   consultas y cero filas. Entrar a una pantalla no es pedir 600 registros.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_CARACTERES = 2;
export const LIMITE_AUTOCOMPLETADO = 15;
export const LIMITE_RESULTADOS = 50;
export const DEBOUNCE_MS = 300;

export type Modo = "auto" | "ci" | "nombre" | "apellido";
export type Ambito = "operativo" | "historico" | "todos";

export interface Coincidencia {
  persona_id: string;
  ci: string;
  nombre_completo: string;
  /** Participación en el operativo actual, si la tiene. */
  chofer_actual_id: string | null;
  /** Participación importada de las planillas históricas, si la tiene. */
  chofer_historico_id: string | null;
  barrio: string | null;
  candidato: string | null;
  estado: string | null;
}

/**
 * Espejo exacto de `fn_normalizar_ci`. Si alguna vez cambia una, tiene que
 * cambiar la otra: son la misma regla escrita dos veces porque una corre en
 * el navegador y la otra dentro de la transacción.
 */
export function normalizarCI(texto: string): string {
  const sinDecimal = texto.trim().replace(/[.,]0+$/, "");
  const soloDigitos = sinDecimal.replace(/[^0-9]/g, "");
  return soloDigitos.replace(/^0+/, "");
}

/** Un término de sólo dígitos, puntos, espacios o guiones es una cédula. */
export function pareceCI(texto: string): boolean {
  return /^[\d.\s-]+$/.test(texto.trim()) && /\d/.test(texto);
}

export function resolverModo(texto: string, modo: Modo): Exclude<Modo, "auto"> {
  if (modo !== "auto") return modo;
  return pareceCI(texto) ? "ci" : "nombre";
}

export interface Opciones {
  modo?: Modo;
  ambito?: Ambito;
  /** Coincidencia parcial: decisión explícita del usuario. */
  parcial?: boolean;
  limite?: number;
  /** El autocompletado busca por prefijo de cédula; el buscador, exacto. */
  prefijoCI?: boolean;
}

export interface Resultado {
  coincidencias: Coincidencia[];
  modoUsado: Exclude<Modo, "auto">;
  ciNormalizada: string | null;
  /** Cuántas habría con coincidencia parcial, cuando la exacta no trajo nada. */
  sugerenciaParcial: number | null;
  error: string | null;
}

const VACIO: Resultado = {
  coincidencias: [], modoUsado: "nombre", ciNormalizada: null,
  sugerenciaParcial: null, error: null,
};

/**
 * Una búsqueda = como mucho tres consultas, todas acotadas y con índice:
 *   1. `personas` filtrada por cédula / nombre / apellido, con LIMIT.
 *   2. `choferes` de esas personas (≤ 15 ids) para saber si participan.
 *   3. `v_choferes_ficha` de esas participaciones, para barrio y candidato.
 *
 * No se descarga la tabla al navegador ni se filtra en memoria.
 */
export async function buscarPersonas(
  supabase: SupabaseClient,
  termino: string,
  opciones: Opciones = {},
): Promise<Resultado> {
  const q = termino.trim();
  if (q.length < MIN_CARACTERES) return VACIO;

  const {
    modo = "auto", ambito = "todos", parcial = false,
    limite = LIMITE_AUTOCOMPLETADO, prefijoCI = true,
  } = opciones;

  const modoUsado = resolverModo(q, modo);
  let ciNormalizada: string | null = null;

  const columnas = "id, ci, nombre_completo, barrio_residencia_id";
  let consulta = supabase.from("personas").select(columnas).is("deleted_at", null);

  if (modoUsado === "ci") {
    ciNormalizada = normalizarCI(q);
    if (!ciNormalizada) return { ...VACIO, modoUsado, error: "Esa cédula no tiene dígitos." };
    consulta = prefijoCI
      ? consulta.like("ci", `${ciNormalizada}%`)
      : consulta.eq("ci", ciNormalizada);
    consulta = consulta.order("ci");
  } else {
    const campo = modoUsado === "apellido" ? "apellidos" : "nombres";
    // `eq` es exacto y sensible a mayúsculas y acentos; `ilike` es la
    // búsqueda parcial que el usuario pide a propósito.
    consulta = parcial
      ? consulta.ilike(campo, `%${q}%`)
      : consulta.eq(campo, q);
    consulta = consulta.order("apellidos").order("nombres");
  }

  const { data: personas, error } = await consulta.limit(limite);
  if (error) return { ...VACIO, modoUsado, ciNormalizada, error: error.message };

  type FilaPersona = { id: string; ci: string; nombre_completo: string; barrio_residencia_id: string | null };
  const filas = (personas ?? []) as FilaPersona[];

  // Si la coincidencia exacta no trajo nada, se cuenta —sin traer filas—
  // cuántas habría con coincidencia parcial, para poder ofrecerla.
  let sugerenciaParcial: number | null = null;
  if (filas.length === 0 && modoUsado !== "ci" && !parcial) {
    const campo = modoUsado === "apellido" ? "apellidos" : "nombres";
    const { count } = await supabase
      .from("personas").select("*", { count: "exact", head: true })
      .is("deleted_at", null).ilike(campo, `%${q}%`);
    sugerenciaParcial = count ?? 0;
  }

  if (filas.length === 0) {
    return { coincidencias: [], modoUsado, ciNormalizada, sugerenciaParcial, error: null };
  }

  // --- Participaciones de esas personas ------------------------------
  const ids = filas.map((p) => p.id);
  const { data: participaciones } = await supabase
    .from("choferes")
    .select("id, persona_id, estado, eleccion_id, origen_planilla_id")
    .in("persona_id", ids)
    .is("deleted_at", null);

  const { data: eleccion } = await supabase
    .from("elecciones").select("id").eq("estado", "activa").maybeSingle();
  const eleccionActual = eleccion?.id ?? null;

  type FilaChofer = {
    id: string; persona_id: string; estado: string;
    eleccion_id: string; origen_planilla_id: string | null;
  };
  const porPersona = new Map<string, { actual?: FilaChofer; historico?: FilaChofer }>();
  for (const ch of (participaciones ?? []) as FilaChofer[]) {
    const acc = porPersona.get(ch.persona_id) ?? {};
    // Operación actual = alta hecha desde la aplicación en la elección
    // vigente. Histórico = lo que entró por una planilla.
    if (ch.origen_planilla_id === null && ch.eleccion_id === eleccionActual) acc.actual = ch;
    else acc.historico = ch;
    porPersona.set(ch.persona_id, acc);
  }

  // --- Barrio y candidato, sólo de las participaciones encontradas ----
  const choferIds = [...porPersona.values()]
    .flatMap((v) => [v.actual?.id, v.historico?.id])
    .filter((x): x is string => Boolean(x));

  const detalle = new Map<string, { barrio: string | null; candidato: string | null }>();
  if (choferIds.length > 0) {
    const { data: fichas } = await supabase
      .from("v_choferes_ficha")
      .select("chofer_id, barrio, candidato")
      .in("chofer_id", choferIds);
    for (const f of (fichas ?? []) as { chofer_id: string; barrio: string | null; candidato: string | null }[]) {
      detalle.set(f.chofer_id, { barrio: f.barrio, candidato: f.candidato });
    }
  }

  let coincidencias: Coincidencia[] = filas.map((p) => {
    const part = porPersona.get(p.id) ?? {};
    const preferida = part.actual ?? part.historico;
    const d = preferida ? detalle.get(preferida.id) : undefined;
    return {
      persona_id: p.id,
      ci: p.ci,
      nombre_completo: p.nombre_completo,
      chofer_actual_id: part.actual?.id ?? null,
      chofer_historico_id: part.historico?.id ?? null,
      barrio: d?.barrio ?? null,
      candidato: d?.candidato ?? null,
      estado: preferida?.estado ?? null,
    };
  });

  if (ambito === "operativo") coincidencias = coincidencias.filter((c) => c.chofer_actual_id);
  if (ambito === "historico") coincidencias = coincidencias.filter((c) => c.chofer_historico_id);

  return { coincidencias, modoUsado, ciNormalizada, sugerenciaParcial, error: null };
}
