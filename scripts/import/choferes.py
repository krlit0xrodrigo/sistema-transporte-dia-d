#!/usr/bin/env python3
"""
Importa la planilla maestra de choferes.

    # 1. Ver qué pasaría, sin escribir nada en el dominio:
    DATABASE_URL=... python3 scripts/import/choferes.py "Logistica Dia D.xlsx"

    # 2. Aplicar:
    DATABASE_URL=... python3 scripts/import/choferes.py "Logistica Dia D.xlsx" --confirmar

Sin --confirmar sólo llena el staging (importaciones + importacion_filas) y
emite el informe. Es el ADR-05: ningún archivo escribe directo en el dominio.

Reglas aplicadas (docs/decisiones-pendientes.md):
  D-18  fila sin CI válida  -> RECHAZADA, no se crea nada
  D-03  CI repetido         -> la primera aparición queda activa,
                               las demás se archivan en apariciones_origen
  D-21  no está en el padrón-> se acepta, marcado `fuera_de_padron`
  D-14  responsable         -> supervisor de la fila, o el concejal si no hay
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from comun import (conectar, linea, normalizar_ci, normalizar_nombre,  # noqa: E402
                   normalizar_telefono, similitud_nombre, titulo, titulo_seccion)

HOJA = "Choferes"
ORIGEN = "logistica_dia_d_choferes"

COL = {
    "ci": "CI del Chofer",
    "nombres": "Nombre del Chofer",
    "apellidos": "Apellido del Chofer",
    "telefono": "Nro de Cel del Chofer",
    "categoria": "Categoria",
    "marca": "Marca",
    "modelo": "Modelo",
    "chapa": "Chapa",
    "candidato": "Candidato",
    "barrio": "Barrio Asignado",
    "supervisor": "Supervisor",
    "estado": "Estado de Servicio",
}
CATEGORIAS = {"AUTOMOVIL": "automovil", "CAMIONETA": "camioneta",
              "MINIBUS": "minibus", "MOTOCICLETA": "motocicleta"}
ESTADOS = {"CONTRATADO": "contratado", "VOLUNTARIO": "voluntario"}

UMBRAL_NOMBRE = 0.5     # por debajo, el nombre del padrón no coincide


# ==========================================================================
def resolver_catalogos(cur, org, eleccion, df):
    """Mapea los textos libres de la planilla al catálogo. Crea lo que falta."""
    cur.execute("select alias_texto, entidad_id from alias_catalogo "
                "where organizacion_id=%s and tipo='candidato'", (org,))
    alias_cand = {normalizar_nombre(a): i for a, i in cur.fetchall()}
    cur.execute("select nombre_publico, id from candidatos where organizacion_id=%s "
                "and eleccion_id=%s", (org, eleccion))
    for nombre, cid in cur.fetchall():
        alias_cand.setdefault(normalizar_nombre(nombre), cid)

    cur.execute("select nombre, id from barrios where organizacion_id=%s", (org,))
    barrios = {normalizar_nombre(n): i for n, i in cur.fetchall()}
    # 'Barrio el Ñiño' y 'Barrio El Niño' tienen que caer en la misma clave
    barrios_cortos = {k.replace("BARRIO ", ""): v for k, v in barrios.items()}

    # Los supervisores vienen sólo por nombre o apodo, sin cédula.
    supervisores = {}
    textos = sorted({str(v).strip() for v in df[COL["supervisor"]].dropna() if str(v).strip()})
    for alias in textos:
        cur.execute(
            """insert into supervisores(organizacion_id, eleccion_id, alias)
               values (%s,%s,%s)
               on conflict (organizacion_id, eleccion_id, alias) do update set alias=excluded.alias
               returning id""", (org, eleccion, alias))
        supervisores[normalizar_nombre(alias)] = cur.fetchone()[0]

    return alias_cand, barrios, barrios_cortos, supervisores


def buscar_padron(cur, ci):
    cur.execute(
        """select p.ci, p.nombre_completo, l.nombre, p.mesa, p.orden
             from padron_electoral p
             join padron_snapshots s on s.id=p.snapshot_id and s.vigente
             left join locales_votacion l on l.id=p.local_votacion_id
            where p.ci=%s""", (ci,))
    return cur.fetchone()


# ==========================================================================
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo")
    ap.add_argument("--confirmar", action="store_true",
                    help="aplica al dominio; sin esto sólo llena el staging")
    ap.add_argument("--hoja", default=HOJA)
    args = ap.parse_args()

    ruta = Path(args.archivo)
    if not ruta.exists():
        raise SystemExit(f"No existe: {ruta}")

    titulo_seccion(f"IMPORTACIÓN DE CHOFERES — hoja '{args.hoja}'"
                   + ("" if args.confirmar else "   [SIMULACIÓN]"))

    sha = hashlib.sha256(ruta.read_bytes()).hexdigest()
    df = pd.read_excel(ruta, sheet_name=args.hoja, dtype=str).dropna(how="all")
    df.columns = [str(c).strip() for c in df.columns]

    faltan = [c for c in COL.values() if c not in df.columns]
    if faltan:
        raise SystemExit(f"Faltan columnas en la planilla: {faltan}")

    con = conectar()
    cur = con.cursor()

    cur.execute("select id from organizaciones where codigo='dia-d-vh'")
    org = cur.fetchone()[0]
    cur.execute("select id from elecciones where organizacion_id=%s and estado='activa'", (org,))
    eleccion = cur.fetchone()[0]
    cur.execute("select id from origenes_planilla where organizacion_id=%s and codigo=%s",
                (org, ORIGEN))
    origen = cur.fetchone()[0]

    usuario = os.environ.get("IMPORT_USER_ID")
    if not usuario:
        cur.execute("select id from usuarios where organizacion_id=%s order by created_at limit 1", (org,))
        fila = cur.fetchone()
        if not fila:
            raise SystemExit("No hay usuarios en la organización. Creá el primer usuario "
                             "o pasá IMPORT_USER_ID=<uuid>.")
        usuario = fila[0]

    cur.execute("select id from padron_snapshots where vigente")
    if not cur.fetchone():
        raise SystemExit("No hay padrón vigente. Corré primero scripts/import/padron.py")

    alias_cand, barrios, barrios_cortos, supervisores = resolver_catalogos(cur, org, eleccion, df)

    # ---------------------------------------------------------------- staging
    cur.execute("delete from importaciones where organizacion_id=%s and archivo_hash=%s and hoja=%s",
                (org, sha, args.hoja))
    cur.execute(
        """insert into importaciones(organizacion_id, origen_planilla_id, archivo_nombre,
                                     archivo_hash, hoja, filas_totales, importado_por, estado)
           values (%s,%s,%s,%s,%s,%s,%s,'cargando') returning id""",
        (org, origen, ruta.name, sha, args.hoja, len(df), usuario))
    importacion = cur.fetchone()[0]

    vistos: dict[str, int] = {}
    apariciones: dict[str, list] = defaultdict(list)
    filas, rechazadas, conflictos, ok = [], [], [], []

    for pos, r in enumerate(df.itertuples(index=False), start=2):   # fila 1 = encabezado
        crudo = {k: (None if pd.isna(v) else str(v))
                 for k, v in zip(df.columns, r)}
        ci = normalizar_ci(crudo.get(COL["ci"]))
        nombres = titulo(crudo.get(COL["nombres"]))
        apellidos = titulo(crudo.get(COL["apellidos"])) or ""
        cand_txt = (crudo.get(COL["candidato"]) or "").strip()
        barrio_txt = (crudo.get(COL["barrio"]) or "").strip()
        super_txt = (crudo.get(COL["supervisor"]) or "").strip()

        norm = {
            "ci": ci,
            "nombres": nombres,
            "apellidos": apellidos,
            "telefono": normalizar_telefono(crudo.get(COL["telefono"])),
            "categoria": CATEGORIAS.get(normalizar_nombre(crudo.get(COL["categoria"]))),
            "marca": titulo(crudo.get(COL["marca"])),
            "modelo": titulo(crudo.get(COL["modelo"])),
            "chapa": (crudo.get(COL["chapa"]) or "").upper().replace(" ", "") or None,
            "estado_servicio": ESTADOS.get(normalizar_nombre(crudo.get(COL["estado"])), "pendiente"),
            "candidato_txt": cand_txt, "barrio_txt": barrio_txt, "supervisor_txt": super_txt,
        }

        errores, estado = [], "ok"

        # ---- D-18: sin CI no hay alta
        if not ci:
            errores.append({"campo": "ci", "error": "cédula vacía o no numérica"})
            estado = "rechazada"
        elif not (5 <= len(ci) <= 9):
            errores.append({"campo": "ci", "error": f"cédula de largo inválido ({len(ci)})"})
            estado = "rechazada"
        if not nombres and estado != "rechazada":
            errores.append({"campo": "nombres", "error": "sin nombre"})
            estado = "rechazada"

        # ---- catálogos
        cand_id = alias_cand.get(normalizar_nombre(cand_txt))
        if cand_txt and not cand_id:
            errores.append({"campo": "candidato", "error": f"no mapeable: {cand_txt}"})
            estado = "rechazada" if estado == "rechazada" else "conflicto"
        nb = normalizar_nombre(barrio_txt)
        barrio_id = barrios.get(nb) or barrios_cortos.get(nb.replace("BARRIO ", ""))
        if barrio_txt and not barrio_id:
            errores.append({"campo": "barrio", "error": f"no mapeable: {barrio_txt}"})
        super_id = supervisores.get(normalizar_nombre(super_txt))

        # ---- padrón (D-21: marca, no bloquea)
        estado_identidad, padron = "fuera_de_padron", None
        if ci and estado != "rechazada":
            padron = buscar_padron(cur, ci)
            if padron:
                sim = similitud_nombre(f"{nombres} {apellidos}", padron[1])
                if sim >= UMBRAL_NOMBRE:
                    estado_identidad = "verificada"
                else:
                    estado_identidad = "discrepancia_nombre"
                    errores.append({"campo": "nombre", "error": "no coincide con el padrón",
                                    "padron": padron[1], "similitud": round(sim, 2)})
                    estado = "conflicto"
        norm["estado_identidad"] = estado_identidad
        norm["padron"] = {"local": padron[2], "mesa": padron[3], "orden": padron[4]} if padron else None

        # ---- D-03: duplicados
        if ci and estado != "rechazada":
            if ci in vistos:
                estado = "conflicto"
                errores.append({"campo": "ci", "error": "CI repetido en el archivo",
                                "primera_fila": vistos[ci]})
            else:
                vistos[ci] = pos
            apariciones[ci].append({
                "fila": pos, "nombre": f"{nombres} {apellidos}".strip(),
                "candidato": cand_txt, "barrio": barrio_txt, "supervisor": super_txt,
                "primera": vistos[ci] == pos,
            })

        norm["candidato_id"] = str(cand_id) if cand_id else None
        norm["barrio_id"] = str(barrio_id) if barrio_id else None
        norm["supervisor_id"] = str(super_id) if super_id else None

        filas.append((importacion, pos, crudo, norm, estado, errores))
        {"ok": ok, "rechazada": rechazadas, "conflicto": conflictos}[estado].append(pos)

    import json
    for f in filas:
        cur.execute(
            """insert into importacion_filas(importacion_id, numero_fila, datos_crudos,
                                             datos_normalizados, estado, errores)
               values (%s,%s,%s,%s,%s,%s)""",
            (f[0], f[1], json.dumps(f[2], ensure_ascii=False),
             json.dumps(f[3], ensure_ascii=False), f[4], json.dumps(f[5], ensure_ascii=False)))

    cur.execute("""update importaciones set filas_ok=%s, filas_error=%s, filas_conflicto=%s,
                          estado='validado' where id=%s""",
                (len(ok), len(rechazadas), len(conflictos), importacion))

    # ---------------------------------------------------------------- informe
    dup = {ci: a for ci, a in apariciones.items() if len(a) > 1}
    verificados = sum(1 for f in filas if f[3].get("estado_identidad") == "verificada")
    fuera = sum(1 for f in filas if f[3].get("estado_identidad") == "fuera_de_padron"
                and f[4] != "rechazada")
    discrep = sum(1 for f in filas if f[3].get("estado_identidad") == "discrepancia_nombre")
    sin_tel = sum(1 for f in filas if not f[3]["telefono"] and f[4] != "rechazada")

    linea("filas leídas", len(df))
    linea("OK", len(ok))
    linea("RECHAZADAS (sin CI válida — D-18)", len(rechazadas))
    linea("con conflicto", len(conflictos))
    print()
    linea("verificadas contra el padrón", verificados)
    linea("fuera del padrón de Villa Hayes (D-21)", fuera)
    linea("nombre que no coincide con el padrón", discrep)
    linea("sin teléfono utilizable", sin_tel)
    print()
    linea("cédulas distintas", len(vistos))
    linea("cédulas repetidas (D-03)", len(dup))
    linea("filas involucradas en repeticiones", sum(len(a) for a in dup.values()))
    linea("supervisores del catálogo", len(supervisores))

    if dup:
        print("\n  Cédulas repetidas — la primera queda activa, el resto se archiva:")
        for ci, aps in sorted(dup.items(), key=lambda x: -len(x[1]))[:8]:
            cands = {a["candidato"] for a in aps if a["candidato"]}
            marca = "  ← cruza candidatos" if len(cands) > 1 else ""
            print(f"    {ci}  ×{len(aps)}  {aps[0]['nombre']}{marca}")
            for a in aps:
                estado_ap = "ACTIVA  " if a["primera"] else "archivada"
                print(f"        fila {a['fila']:>4}  {estado_ap}  {a['candidato'] or '(sin candidato)'}"
                      f"  ·  {a['barrio'] or '(sin barrio)'}")
        if len(dup) > 8:
            print(f"    … y {len(dup) - 8} cédulas repetidas más (todas en el staging)")

    # ---------------------------------------------------------------- aplicar
    if not args.confirmar:
        con.commit()
        print(f"\n  Staging guardado (importación {importacion}). No se tocó el dominio.")
        print("  Para aplicar:  … choferes.py <archivo> --confirmar")
        con.close()
        return 0

    creados = archivados = 0
    for importacion_id, pos, crudo, norm, estado, _err in filas:
        if estado == "rechazada" or not norm["ci"]:
            continue
        primera = vistos[norm["ci"]] == pos

        cur.execute(
            """insert into personas(organizacion_id, ci, ci_original, nombres, apellidos,
                                    telefono_e164, telefono_original, padron_ci,
                                    verificado_en_padron, estado_identidad, created_by)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               on conflict (organizacion_id, ci) where deleted_at is null
               do update set telefono_e164 = coalesce(personas.telefono_e164, excluded.telefono_e164)
               returning id""",
            (org, norm["ci"], crudo.get(COL["ci"]), norm["nombres"], norm["apellidos"],
             norm["telefono"], crudo.get(COL["telefono"]),
             norm["ci"] if norm["estado_identidad"] != "fuera_de_padron" else None,
             norm["estado_identidad"] != "fuera_de_padron", norm["estado_identidad"], usuario))
        persona = cur.fetchone()[0]

        cur.execute(
            """insert into apariciones_origen(organizacion_id, persona_id, eleccion_id,
                   importacion_id, origen_planilla_id, hoja, numero_fila, nombre_texto,
                   candidato_texto, barrio_texto, supervisor_texto, estado_texto, fue_aplicada)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (org, persona, eleccion, importacion_id, origen, args.hoja, pos,
             f"{norm['nombres']} {norm['apellidos']}".strip(), norm["candidato_txt"],
             norm["barrio_txt"], norm["supervisor_txt"], norm["estado_servicio"], primera))

        if not primera:
            archivados += 1
            continue
        if not norm["candidato_id"]:
            continue   # sin candidato no hay asignación posible

        cur.execute(
            """insert into choferes(organizacion_id, persona_id, eleccion_id, estado_servicio,
                   estado, origen_planilla_id, declarado_por,
                   responsable_supervisor_id, responsable_candidato_id, created_by)
               values (%s,%s,%s,%s,'activo',%s,%s,%s,%s,%s) returning id""",
            (org, persona, eleccion, norm["estado_servicio"], origen, usuario,
             norm["supervisor_id"],
             None if norm["supervisor_id"] else norm["candidato_id"], usuario))
        chofer = cur.fetchone()[0]
        creados += 1

        if norm["chapa"]:
            cur.execute(
                """insert into vehiculos(organizacion_id, chapa, categoria, marca, modelo)
                   values (%s,%s,%s,%s,%s)
                   on conflict (organizacion_id, chapa) where chapa is not null and deleted_at is null
                   do update set marca = coalesce(excluded.marca, vehiculos.marca)
                   returning id""",
                (org, norm["chapa"], norm["categoria"], norm["marca"], norm["modelo"]))
            vehiculo = cur.fetchone()[0]
            cur.execute("select 1 from chofer_vehiculos where vehiculo_id=%s and hasta is null",
                        (vehiculo,))
            if not cur.fetchone():
                cur.execute("insert into chofer_vehiculos(chofer_id, vehiculo_id) values (%s,%s)",
                            (chofer, vehiculo))

        cur.execute(
            """insert into asignaciones(chofer_id, eleccion_id, candidato_id, barrio_id,
                                        supervisor_id, asignado_por)
               values (%s,%s,%s,%s,%s,%s)""",
            (chofer, eleccion, norm["candidato_id"], norm["barrio_id"],
             norm["supervisor_id"], usuario))

    cur.execute("update importaciones set estado='confirmado', confirmado_por=%s, "
                "confirmado_en=now() where id=%s", (usuario, importacion))
    con.commit()

    print()
    linea("choferes creados", creados)
    linea("apariciones archivadas (D-03)", archivados)
    cur.execute("select count(*) from personas where organizacion_id=%s", (org,))
    linea("personas en la base", cur.fetchone()[0])
    print("\n  ✓ Importación confirmada.")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
