"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEBOUNCE_MS, MIN_CARACTERES, normalizarCI, pareceCI,
  type Ambito, type Coincidencia, type Modo,
} from "@/lib/busqueda";

/**
 * Buscador con autocompletado.
 *
 * Tres cosas que lo hacen rápido y que antes no estaban:
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
}

export function Buscador({ ambito = "todos", marcador, autoFocus }: Props) {
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
    const chofer = c.chofer_actual_id ?? c.chofer_historico_id;
    router.push(chofer
      ? `/choferes/${chofer}`
      : `/choferes/nuevo?ci=${encodeURIComponent(c.ci)}`);
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
          <input
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
            className="block w-full rounded-lg border-0 bg-white py-2.5 pl-3 pr-10 text-sm text-tinta shadow-sm ring-1 ring-inset ring-borde placeholder:text-tinta-tenue focus:ring-2 focus:ring-inset focus:ring-rojo"
          />
          {cargando && (
            <span aria-hidden="true"
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-200 border-t-rojo" />
          )}
        </div>

        <select value={modo} onChange={(e) => setModo(e.target.value as Modo)}
                aria-label="Campo de búsqueda"
                className="rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-tinta shadow-sm ring-1 ring-inset ring-borde focus:ring-2 focus:ring-inset focus:ring-rojo sm:w-40">
          {(Object.keys(ETIQUETA_MODO) as Modo[]).map((m) => (
            <option key={m} value={m}>{ETIQUETA_MODO[m]}</option>
          ))}
        </select>
      </div>

      <p className="mt-2 text-xs text-tinta-tenue" aria-live="polite">
        {termino.length === 0 ? (
          <>La cédula se busca con puntos o sin puntos. El nombre y el apellido, exactos.</>
        ) : modoEfectivo === "ci" ? (
          <>Buscando cédulas que empiezan con <strong className="tabular-nums text-tinta">{normalizarCI(termino) || "—"}</strong></>
        ) : (
          <>
            Coincidencia {parcial ? "parcial" : "exacta"} de {modoEfectivo === "apellido" ? "apellido" : "nombre"}
            {!parcial && " — distingue mayúsculas y acentos"}
          </>
        )}
      </p>

      {/* La búsqueda parcial existe, pero se enciende a mano. */}
      {buscado && coincidencias.length === 0 && !parcial && sugerencia !== null && sugerencia > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ninguna coincidencia exacta.{" "}
          <button type="button" onClick={() => setParcial(true)}
                  className="font-semibold underline underline-offset-2">
            Hay {sugerencia} con coincidencia parcial — buscar así
          </button>
        </div>
      )}
      {parcial && (
        <div className="mt-2 text-xs text-tinta-tenue">
          Coincidencia parcial activa.{" "}
          <button type="button" onClick={() => setParcial(false)}
                  className="font-medium text-rojo-700 underline underline-offset-2">
            Volver a exacta
          </button>
        </div>
      )}

      {abierto && coincidencias.length > 0 && (
        <ul id={idLista} role="listbox"
            className="absolute z-20 mt-2 max-h-96 w-full overflow-auto rounded-xl border border-borde bg-white py-1 shadow-elevada">
          {coincidencias.map((c, i) => (
            <li key={c.persona_id} role="option" aria-selected={i === resaltado}>
              <button type="button"
                onMouseEnter={() => setResaltado(i)}
                onClick={() => abrir(c)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${i === resaltado ? "bg-rojo-50" : ""}`}>
                <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-tinta">
                  {formatearCI(c.ci)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-tinta">{c.nombre_completo}</span>
                  <span className="block truncate text-xs text-tinta-tenue">
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
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-borde bg-white px-4 py-5 text-center shadow-elevada">
          <p className="text-sm text-tinta">Ninguna coincidencia.</p>
          {modoEfectivo === "ci" && normalizarCI(termino).length >= 5 && (
            <a href={`/choferes/nuevo?ci=${encodeURIComponent(normalizarCI(termino))}`}
               className="mt-2 inline-block text-sm font-medium text-rojo-700 underline underline-offset-4">
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
    return <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">Operativo</span>;
  }
  if (c.chofer_historico_id) {
    return <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-tinta-suave ring-1 ring-inset ring-zinc-200">Histórico</span>;
  }
  return <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200">Sin alta</span>;
}

function formatearCI(ci: string): string {
  return ci.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
