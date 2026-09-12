#!/usr/bin/env python3
"""
Importa el histórico de actividad del reporte del 07/06/2026
(Internas ANR Municipales) como antecedentes.

    DATABASE_URL=... python3 scripts/import/antecedentes.py "Reporte_Choferes.xlsx" [--confirmar]

ADVERTENCIA DE CALIDAD, y por eso queda marcado en la base:
el reporte NO trae cédula. El cruce sólo puede hacerse por nombre, y el
maestro tiene 52 nombres repetidos y 5 homónimos con cédulas distintas.
Todo lo que entra por acá lleva `confiabilidad_dato = 'baja'` y
`fuente = 'reporte_cruce_por_nombre'`, y la ficha del chofer lo muestra así.

Sirve para ver el historial. NO sirve para decidir un pago.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
import psycopg

sys.path.insert(0, str(Path(__file__).parent))
from comun import conectar, linea, normalizar_nombre, titulo_seccion  # noqa: E402

FUENTE = "reporte_cruce_por_nombre"


def leer(ruta: Path, hoja: str) -> pd.DataFrame:
    df = pd.read_excel(ruta, sheet_name=hoja, dtype=str, header=2).dropna(how="all")
    df.columns = [str(c).strip() for c in df.columns]
    return df[df["Nombre Completo"].notna()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo")
    ap.add_argument("--confirmar", action="store_true")
    args = ap.parse_args()

    ruta = Path(args.archivo)
    if not ruta.exists():
        raise SystemExit(f"No existe: {ruta}")

    titulo_seccion("ANTECEDENTES 07/06/2026" + ("" if args.confirmar else "   [SIMULACIÓN]"))
    print("  ⚠ cruce por NOMBRE — todo entra con confiabilidad 'baja'\n")

    activos = leer(ruta, "ACTIVOS")
    inactivos = leer(ruta, "INACTIVOS")
    linea("filas ACTIVOS", len(activos))
    linea("filas INACTIVOS", len(inactivos))

    con = conectar()
    cur = con.cursor()
    cur.execute("select id from organizaciones where codigo='dia-d-vh'")
    org = cur.fetchone()[0]
    cur.execute("""select id from elecciones where organizacion_id=%s
                    and fecha = date '2026-06-07'""", (org,))
    fila = cur.fetchone()
    if not fila:
        raise SystemExit("Falta la elección del 07/06/2026 en el catálogo (seed.sql).")
    eleccion = fila[0]

    # Índice de personas por nombre normalizado. Los nombres ambiguos
    # (más de una persona) se descartan: preferimos no tener el dato antes
    # que atribuirlo a la persona equivocada.
    cur.execute("select id, nombre_completo from personas where organizacion_id=%s", (org,))
    por_nombre: dict[str, list] = {}
    for pid, nombre in cur.fetchall():
        por_nombre.setdefault(normalizar_nombre(nombre), []).append(pid)

    ambiguos = sum(1 for v in por_nombre.values() if len(v) > 1)
    linea("nombres ambiguos en la base", ambiguos, "(se descartan)")

    def km(valor):
        try:
            return round(float(str(valor).replace(",", ".")), 2)
        except (TypeError, ValueError):
            return None

    # ------------------------------------------------------------------
    # CONSOLIDACIÓN POR PERSONA — se hace ANTES de tocar la base.
    #
    # El bug que esto corrige: se recorría ACTIVOS y después INACTIVOS,
    # insertando una fila por cada aparición. Como la restricción única es
    # (persona_id, eleccion_id, rol), el `do update` de la segunda hoja
    # pisaba a la primera, y las 20 personas que figuran en las dos
    # terminaban marcadas `no_cumplio` aunque tuvieran evidencia de haber
    # trabajado. El orden de las hojas decidía el resultado.
    #
    # Regla: haber estado activo alguna vez gana. Una persona con registro
    # de movimiento trabajó, aunque otra fila la liste como inactiva.
    # ------------------------------------------------------------------
    consolidado: dict = {}
    sin_match = ambiguo_hit = 0

    for df, hoja, activo in ((activos, "ACTIVOS", True), (inactivos, "INACTIVOS", False)):
        for r in df.itertuples(index=False):
            datos = dict(zip(df.columns, r))
            clave = normalizar_nombre(datos.get("Nombre Completo"))
            candidatos = por_nombre.get(clave, [])
            if not candidatos:
                sin_match += 1
                continue
            if len(candidatos) > 1:
                ambiguo_hit += 1
                continue

            persona = candidatos[0]
            acc = consolidado.setdefault(persona, {
                "hojas": set(), "apariciones": 0, "km": None, "notas": []})
            acc["hojas"].add(hoja)
            acc["apariciones"] += 1

            # km: se queda el mayor valor conocido. Un "-" o vacío no pisa
            # un kilometraje real.
            k = km(datos.get("Distancia (km)"))
            if k is not None and (acc["km"] is None or k > acc["km"]):
                acc["km"] = k

            nota = str(datos.get("Nota de Evidencia") or "").strip()
            if nota and nota not in acc["notas"]:
                acc["notas"].append(nota)

    registros = []
    for persona, acc in consolidado.items():
        # Punto 6: ACTIVOS prevalece siempre.
        cumplio = "ACTIVOS" in acc["hojas"]
        registros.append((
            org, persona, eleccion, "chofer",
            "cumplio" if cumplio else "no_cumplio",
            acc["km"],
            cumplio,                                   # tuvo_gps
            " | ".join(acc["notas"])[:500] or None,
        ))

    con_match = sum(a["apariciones"] for a in consolidado.values())
    en_ambas = sum(1 for a in consolidado.values() if len(a["hojas"]) == 2)
    solo_act = sum(1 for a in consolidado.values() if a["hojas"] == {"ACTIVOS"})
    solo_ina = sum(1 for a in consolidado.values() if a["hojas"] == {"INACTIVOS"})
    repetidas = sum(1 for a in consolidado.values() if a["apariciones"] > 1)
    cumplio_n = sum(1 for x in registros if x[4] == "cumplio")

    print()
    linea("filas con match único", con_match)
    linea("sin match en la base", sin_match)
    linea("descartados por homonimia", ambiguo_hit)
    print()
    linea("personas distintas con match", len(consolidado))
    linea("  sólo en ACTIVOS", solo_act)
    linea("  sólo en INACTIVOS", solo_ina)
    linea("  en AMBAS hojas", en_ambas, "→ prevalece cumplio")
    linea("  con más de una aparición", repetidas)
    print()
    print("  Antecedentes consolidados (uno por persona):")
    linea("  resultado = cumplio", cumplio_n)
    linea("  resultado = no_cumplio", len(registros) - cumplio_n)
    linea("  con kilometraje conocido", sum(1 for x in registros if x[5] is not None))

    if not args.confirmar:
        con.close()
        print("\n  Simulación. No se modificó la base. Para aplicar: --confirmar")
        return 0

    # Un registro por persona: la restricción única (persona_id, eleccion_id,
    # rol) ya no puede dispararse dentro de la misma corrida. El `do update`
    # queda sólo para la reejecución, y escribe los mismos valores porque la
    # consolidación es determinista: correr dos veces da el mismo resultado.
    cur.executemany(
        """insert into antecedentes(organizacion_id, persona_id, eleccion_id, rol,
               resultado, km_recorridos, tuvo_gps, incidentes,
               confiabilidad_dato, fuente)
           values (%s,%s,%s,%s,%s,%s,%s,%s,'baja',%s)
           on conflict (persona_id, eleccion_id, rol) do update
             set resultado      = excluded.resultado,
                 km_recorridos  = excluded.km_recorridos,
                 tuvo_gps       = excluded.tuvo_gps,
                 incidentes     = excluded.incidentes,
                 confiabilidad_dato = excluded.confiabilidad_dato,
                 fuente         = excluded.fuente""",
        [(*reg, FUENTE) for reg in registros])
    con.commit()

    # El reporte repite personas (los mismos nombres duplicados del maestro),
    # así que las filas insertadas son menos que los registros con match.
    # Resumen final leído de la base, no de la memoria: lo que se informa es
    # lo que quedó escrito.
    cur.execute("""select count(*),
                          count(*) filter (where resultado = 'cumplio'),
                          count(*) filter (where resultado = 'no_cumplio'),
                          count(distinct persona_id)
                     from antecedentes where eleccion_id=%s and fuente=%s""",
                (eleccion, FUENTE))
    guardados, g_cumplio, g_no_cumplio, g_personas = cur.fetchone()
    con.close()

    titulo_seccion("RESUMEN DE LA CARGA")
    linea("filas del Excel (ACTIVOS + INACTIVOS)", len(activos) + len(inactivos))
    linea("filas con match único", con_match)
    linea("sin match en la base", sin_match)
    linea("descartados por homonimia", ambiguo_hit)
    print()
    linea("personas distintas con match", len(consolidado))
    linea("personas en ACTIVOS + INACTIVOS", en_ambas, "→ quedaron cumplio")
    print()
    linea("antecedentes guardados", guardados)
    linea("  cumplió", g_cumplio)
    linea("  no cumplió", g_no_cumplio)
    linea("personas distintas en la tabla", g_personas)

    if guardados != len(registros):
        linea("⚠ diferencia con lo calculado", guardados - len(registros))

    print("\n  ✓ Cargados con confiabilidad 'baja' — sirven para ver historial, "
          "no para decidir un pago.")
    return 0


def ejecutar() -> int:
    """
    Envoltorio de seguridad (punto 11).

    Toda la escritura vive en una única transacción con un solo `commit()`.
    Ante cualquier error —red, Ctrl+C, dato inesperado— se hace `rollback()`
    explícito: la carga es completa o no existe. Nunca parcial.
    """
    con_holder = {}
    global conectar
    _conectar = conectar

    def _rastrear(*a, **kw):
        con = _conectar(*a, **kw)
        con_holder["con"] = con
        return con

    conectar = _rastrear
    try:
        return main()
    except KeyboardInterrupt:
        print("\n  Interrumpido. Se revierte la transacción; no quedó carga parcial.")
        return 130
    except psycopg.OperationalError as e:
        print(f"\n  ERROR DE CONEXIÓN: {e}")
        print("  La transacción no se confirmó: la tabla quedó como estaba.")
        return 1
    except Exception as e:                      # noqa: BLE001
        print(f"\n  ERROR: {type(e).__name__}: {e}")
        print("  La transacción no se confirmó: la tabla quedó como estaba.")
        return 1
    finally:
        con = con_holder.get("con")
        if con is not None and not con.closed:
            try:
                con.rollback()      # inocuo si ya se hizo commit
            except Exception:       # noqa: BLE001
                pass
            con.close()


if __name__ == "__main__":
    sys.exit(ejecutar())
