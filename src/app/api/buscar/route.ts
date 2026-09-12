/**
 * Endpoint del autocompletado.
 *
 *   GET /api/buscar?q=436&modo=auto&ambito=todos&parcial=0
 *
 * Corre del lado del servidor con el JWT del usuario, así que las filas
 * que devuelve son exactamente las que RLS le permite ver: un supervisor
 * no autocompleta con gente que no es suya. El navegador nunca recibe la
 * tabla, sólo las 15 filas que pidió.
 */

import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  LIMITE_AUTOCOMPLETADO, MIN_CARACTERES, buscarPersonas,
  type Ambito, type Modo,
} from "@/lib/busqueda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODOS: Modo[] = ["auto", "ci", "nombre", "apellido"];
const AMBITOS: Ambito[] = ["operativo", "historico", "todos"];

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();

  if (q.length < MIN_CARACTERES) {
    return NextResponse.json({ coincidencias: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión no iniciada." }, { status: 401 });

  const modo = (sp.get("modo") ?? "auto") as Modo;
  const ambito = (sp.get("ambito") ?? "todos") as Ambito;

  const resultado = await buscarPersonas(supabase, q, {
    modo: MODOS.includes(modo) ? modo : "auto",
    ambito: AMBITOS.includes(ambito) ? ambito : "todos",
    parcial: sp.get("parcial") === "1",
    limite: LIMITE_AUTOCOMPLETADO,
    prefijoCI: true,
  });

  return NextResponse.json(resultado, {
    // Datos operativos: nunca se cachean. Un chofer dado de alta hace diez
    // segundos tiene que aparecer en la siguiente tecla.
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
