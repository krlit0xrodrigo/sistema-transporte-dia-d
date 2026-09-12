#!/usr/bin/env python3
"""
Importa el padrón electoral de Villa Hayes.

    DATABASE_URL=... python3 scripts/import/padron.py padron_villa_hayes-utf8.csv

El archivo esperado es el export oficial: separador ';', UTF-8 con BOM,
columnas de participación con nombre 'jun-21', 'oct-21', ...

Es idempotente por hash: el mismo archivo no se importa dos veces.
El snapshot nuevo queda vigente y el anterior deja de estarlo.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from comun import conectar, linea, normalizar_ci, titulo_seccion  # noqa: E402

COLUMNAS_PARTICIPACION = ("jun-21", "oct-21", "dic-22", "abr-23", "jun-26")


def codigo_eleccion(col: str) -> str:
    """'jun-21' -> 'jun2021'. Estable aunque el export cambie el formato."""
    mes, anio = col.split("-")
    return f"{mes}20{anio}"


def main(ruta: str) -> int:
    archivo = Path(ruta)
    if not archivo.exists():
        raise SystemExit(f"No existe: {archivo}")

    titulo_seccion("IMPORTACIÓN DEL PADRÓN")

    datos = archivo.read_bytes()
    sha = hashlib.sha256(datos).hexdigest()

    # El encoding importa: un export en latin-1 mal convertido pierde las Ñ
    # de forma irreversible. Si aparece el carácter de reemplazo, se corta.
    perdidos = datos.count("�".encode())
    if perdidos:
        raise SystemExit(
            f"ABORTADO: el archivo tiene {perdidos} caracteres de reemplazo (�).\n"
            "Las Ñ están perdidas y no se recuperan por conversión. "
            "Re-exportá el CSV en UTF-8."
        )

    df = pd.read_csv(archivo, sep=";", dtype=str, encoding="utf-8-sig",
                     keep_default_na=False, na_values=[""])
    df["ci"] = df["cedula"].map(normalizar_ci)

    linea("archivo", archivo.name)
    linea("sha256", sha[:16] + "…")
    linea("filas", len(df))
    linea("cédulas únicas", df["ci"].nunique())
    linea("sin cédula válida", int(df["ci"].isna().sum()))

    sin_ci = int(df["ci"].isna().sum())
    if sin_ci:
        print(f"  ⚠ se omiten {sin_ci} filas sin cédula válida")
        df = df[df["ci"].notna()]

    dup = df["ci"].duplicated().sum()
    if dup:
        raise SystemExit(f"ABORTADO: {dup} cédulas duplicadas en el padrón. "
                         "El padrón oficial no debería tenerlas.")

    con = conectar()
    try:
        with con.cursor() as cur:
            cur.execute("select id from padron_snapshots where archivo_hash = %s", (sha,))
            if (fila := cur.fetchone()):
                print(f"\n  Este archivo ya fue importado (snapshot {fila[0]}). Nada que hacer.")
                return 0

            # Locales de votación: el padrón es la fuente del catálogo.
            locales = (df[["local", "local_nombre", "zona"]]
                       .drop_duplicates(subset=["local"])
                       .sort_values("local"))
            for _, r in locales.iterrows():
                cur.execute(
                    """insert into locales_votacion(codigo, nombre, zona)
                       values (%s, %s, %s)
                       on conflict (codigo) do update set nombre = excluded.nombre""",
                    (str(r["local"]), r["local_nombre"], r["zona"]))
            linea("locales de votación", len(locales))

            cur.execute("select codigo, id from locales_votacion")
            mapa_local = dict(cur.fetchall())

            # Un solo snapshot vigente a la vez.
            cur.execute("update padron_snapshots set vigente = false where vigente")
            cur.execute(
                """insert into padron_snapshots(anio, fuente, archivo_hash, encoding, filas, vigente)
                   values (%s, %s, %s, 'UTF-8', %s, true) returning id""",
                (2026, archivo.name, sha, len(df)))
            snapshot_id = cur.fetchone()[0]

            # --- padron_electoral -------------------------------------------
            filas = [
                (snapshot_id, r.ci, r.nombre,
                 (r.nombre.split(",")[0].strip() if "," in str(r.nombre) else None),
                 (r.nombre.split(",", 1)[1].strip() if "," in str(r.nombre) else str(r.nombre)),
                 mapa_local.get(str(r.local)),
                 int(r.mesa) if pd.notna(r.mesa) else None,
                 int(r.orden) if pd.notna(r.orden) else None,
                 r.direccion if pd.notna(r.direccion) else None,
                 r.zona,
                 r.partidos if pd.notna(r.partidos) else None,
                 r.seccional if pd.notna(r.seccional) else None)
                for r in df.itertuples()
            ]
            with cur.copy(
                """copy padron_electoral
                   (snapshot_id, ci, nombre_completo, apellidos, nombres,
                    local_votacion_id, mesa, orden, direccion, zona, partidos, seccional)
                   from stdin"""
            ) as copia:
                for f in filas:
                    copia.write_row(f)
            linea("padron_electoral", len(filas), "filas")

            # --- padron_participacion (formato largo) ------------------------
            participacion = []
            for col in COLUMNAS_PARTICIPACION:
                if col not in df.columns:
                    continue
                cod = codigo_eleccion(col)
                sub = df[df[col].isin(["S", "N"])]
                participacion += list(zip(
                    [snapshot_id] * len(sub), sub["ci"], [cod] * len(sub), sub[col]))
            if participacion:
                with cur.copy(
                    "copy padron_participacion (snapshot_id, ci, eleccion_codigo, voto) from stdin"
                ) as copia:
                    for f in participacion:
                        copia.write_row(f)
            linea("padron_participacion", len(participacion), "filas")

        con.commit()
    finally:
        con.close()

    print("\n  ✓ Padrón importado y marcado como vigente.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sys.exit(main(sys.argv[1]))
