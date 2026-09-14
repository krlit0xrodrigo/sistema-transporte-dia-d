"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEBOUNCE_MS, MIN_CARACTERES, normalizarCI, pareceCI,
  type Ambito, type Coincidencia, type Modo,
} from "@/lib/busqueda";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Loader2 } from "lucide-react";

/**
 * Buscador con autocompletado.
 *
 * Tres cosas que lo hacen rápido:
 *
 * 1. **Debounce de 300 ms.** Escribir «4361034» son siete pulsaciones;
 *    antes eran siete consultas. Ahora es una.
 * 2. **Cancelación.** Cada búsqueda aborta la anterior con AbortController.
 *    Sin esto, una respuesta lenta llega después de una rápida y pinta
 *    resultados viejos sobre los nuevos.
 * 3. **Servidor.** El navegador recibe 15 filas, nunca la tabla.
 */

const ETIQUETA_MODO: Record<Modo, string> = {
  auto: "Automático",
  ci: "Cédula",
  nombre: "Nombre",
  apellido: "Apellido",
};

interface Props {
  ambito?: Ambito;
  /** Texto del campo vacío. */
  marcador?: string;
  autoFocus?: boolean;
  /** Ruta destino al seleccionar. Default: /choferes/:id */
  destino?: "choferes" | "consulta";
}

export function Buscador({
  ambito = "todos",
  marcador,
  autoFocus,
  destino = "choferes",
}: Props) {
  const router = useRouter();
  const idLista = useId();

  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<Modo>("auto");
  const [parcial, setParcial] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(-1);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([]);
  const [sugerencia, setSugerencia] = useState<number | null>(null);
  const [buscado, setBuscado] = useState(false);

  const contenedor = useRef<HTMLDivElement>(null);
  const aborto = useRef<AbortController | null>(null);

  const termino = texto.trim();

  useEffect(() => {
    if (termino.length < MIN_CARACTERES) {
      aborto.current?.abort();
      setCoincidencias([]); setSugerencia(null); setBuscado(false);
      setCargando(false); setAbierto(false);
      return;
    }

    setCargando(true);
    const temporizador = setTimeout(async () => {
      aborto.current?.abort();
      const ctrl = new AbortController();
      aborto.current = ctrl;
      try {
        const p = new URLSearchParams({
          q: termino, modo, ambito, parcial: parcial ? "1" : "0",
        });
        const r = await fetch(`/api/buscar?${p}`, { signal: ctrl.signal });
        const datos = await r.json();
        setCoincidencias(datos.coincidencias ?? []);
        setSugerencia(datos.sugerenciaParcial ?? null);
        setBuscado(true);
        setAbierto(true);
        setResaltado(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setCoincidencias([]); setBuscado(true);
        }
      } finally {
        // Una petición abortada no apaga el indicador: la que la reemplazó
        // sigue en curso.
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(temporizador);
  }, [termino, modo, ambito, parcial]);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  function abrir(c: Coincidencia) {
    if (destino === "consulta") {
      router.push(`/consulta/${encodeURIComponent(c.ci)}`);
    } else {
      const chofer = c.chofer_actual_id ?? c.chofer_historico_id;
      router.push(chofer
        ? `/choferes/${chofer}`
        : `/choferes/nuevo?ci=${encodeURIComponent(c.ci)}`);
    }
    setAbierto(false);
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto || coincidencias.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => (i + 1) % coincidencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => (i <= 0 ? coincidencias.length - 1 : i - 1));
    } else if (e.key === "Enter" && resaltado >= 0) {
      e.preventDefault();
      abrir(coincidencias[resaltado]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const esCI = pareceCI(termino);
  const modoEfectivo = modo === "auto" ? (esCI ? "ci" : "nombre") : modo;

  return (
    <div ref={contenedor} className="relative">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-label="Buscar por cédula, nombre o apellido"
            autoComplete="off"
            autoFocus={autoFocus}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={teclas}
            onFocus={() => coincidencias.length > 0 && setAbierto(true)}
            placeholder={marcador ?? "Cédula, nombre o apellido — por ejemplo 4.361.034"}
            className="pl-10 pr-10"
          />
          {cargando && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          )}
        </div>

        <select
          value={modo}
          onChange={(e) => setModo(e.target.value as Modo)}
          aria-label="Campo de búsqueda"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-40"
        >
          {(Object.keys(ETIQUETA_MODO) as Modo[]).map((m) => (
            <option key={m} value={m}>{ETIQUETA_MODO[m]}</option>
          ))}
        </select>
      </div>

      <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
        {termino.length === 0 ? (
          <>La cédula se busca con puntos o sin puntos. El nombre y el apellido, exactos.</>
        ) : modoEfectivo === "ci" ? (
          <>Buscando cédulas que empiezan con <strong className="tabular-nums text-foreground">{normalizarCI(termino) || "—"}</strong></>
        ) : (
          <>
            Coincidencia {parcial ? "parcial" : "exacta"} de {modoEfectivo === "apellido" ? "apellido" : "nombre"}
            {!parcial && " — distingue mayúsculas y acentos"}
          </>
        )}
      </p>

      {/* La búsqueda parcial existe, pero se enciende a mano. */}
      {buscado && coincidencias.length === 0 && !parcial && sugerencia !== null && sugerencia > 0 && (
        <div className="mt-2 rounded-lg border border-warning/30 bg-warning-50 px-3 py-2 text-xs text-warning">
          Ninguna coincidencia exacta.{" "}
          <button type="button" onClick={() => setParcial(true)}
                  className="font-semibold underline underline-offset-2">
            Hay {sugerencia} con coincidencia parcial — buscar así
          </button>
        </div>
      )}
      {parcial && (
        <div className="mt-2 text-xs text-muted-foreground">
          Coincidencia parcial activa.{" "}
          <button type="button" onClick={() => setParcial(false)}
                  className="font-medium text-primary underline underline-offset-2">
            Volver a exacta
          </button>
        </div>
      )}

      {abierto && coincidencias.length > 0 && (
        <ul id={idLista} role="listbox"
            className="absolute z-50 mt-2 max-h-96 w-full overflow-auto rounded-xl border bg-popover py-1 shadow-lg">
          {coincidencias.map((c, i) => (
            <li key={c.persona_id} role="option" aria-selected={i === resaltado}>
              <button type="button"
                onMouseEnter={() => setResaltado(i)}
                onClick={() => abrir(c)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  i === resaltado ? "bg-accent" : "hover:bg-accent/50",
                )}>
                <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">
                  {formatearCI(c.ci)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.nombre_completo}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.barrio ?? "Sin barrio"}{c.candidato ? ` · ${c.candidato}` : ""}
                  </span>
                </span>
                <Etiqueta c={c} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto && buscado && coincidencias.length === 0 && sugerencia === null && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-popover px-4 py-5 text-center shadow-lg">
          <p className="text-sm">Ninguna coincidencia.</p>
          {modoEfectivo === "ci" && normalizarCI(termino).length >= 5 && (
            <a href={`/choferes/nuevo?ci=${encodeURIComponent(normalizarCI(termino))}`}
               className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">
              Dar de alta la cédula {normalizarCI(termino)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Etiqueta({ c }: { c: Coincidencia }) {
  if (c.chofer_actual_id) {
    return <Badge variant="success" className="shrink-0">Operativo</Badge>;
  }
  if (c.chofer_historico_id) {
    return <Badge variant="secondary" className="shrink-0">Histórico</Badge>;
  }
  return <Badge variant="info" className="shrink-0">Sin alta</Badge>;
}

function formatearCI(ci: string): string {
  return ci.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
