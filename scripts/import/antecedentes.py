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

    registros, sin_match, ambiguo_hit = [], 0, 0
    for df, resultado, tuvo_gps in ((activos, "cumplio", True), (inactivos, "no_cumplio", False)):
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
            registros.append((org, candidatos[0], eleccion, "chofer", resultado,
                              km(datos.get("Distancia (km)")), tuvo_gps,
                              str(datos.get("Nota de Evidencia") or "")[:500]))

    print()
    linea("antecedentes con match único", len(registros))
    linea("sin match en la base", sin_match)
    linea("descartados por homonimia", ambiguo_hit)
    linea("  de ellos, cumplió", sum(1 for x in registros if x[4] == "cumplio"))
    linea("  de ellos, no cumplió", sum(1 for x in registros if x[4] == "no_cumplio"))

    if not args.confirmar:
        con.close()
        print("\n  Simulación. Para aplicar: --confirmar")
        return 0

    for reg in registros:
        cur.execute(
            """insert into antecedentes(organizacion_id, persona_id, eleccion_id, rol,
                   resultado, km_recorridos, tuvo_gps, incidentes,
                   confiabilidad_dato, fuente)
               values (%s,%s,%s,%s,%s,%s,%s,%s,'baja',%s)
               on conflict (persona_id, eleccion_id, rol) do update
                 set resultado = excluded.resultado,
                     km_recorridos = excluded.km_recorridos""",
            (*reg, FUENTE))
    con.commit()

    # El reporte repite personas (los mismos nombres duplicados del maestro),
    # así que las filas insertadas son menos que los registros con match.
    cur.execute("select count(*) from antecedentes where eleccion_id=%s", (eleccion,))
    guardados = cur.fetchone()[0]
    con.close()
    print()
    linea("registros con match", len(registros))
    linea("antecedentes distintos guardados", guardados)
    if len(registros) != guardados:
        linea("colapsados por persona repetida", len(registros) - guardados)
    print("\n  ✓ Cargados con confiabilidad 'baja' — sirven para ver historial, "
          "no para decidir un pago.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
