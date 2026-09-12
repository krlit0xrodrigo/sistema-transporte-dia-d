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
  D-18  fila sin CI válida  -> `rechazada`. No se crea persona, ni chofer,
                               ni asignación, ni aparición.
  D-03  CI repetida         -> se distinguen TRES casos:
          a) CI única ................... `ok`
          b) CI repetida, MISMO candidato . la primera queda `ok`;
             las siguientes quedan `conflicto` con el error
             "CI repetida con el mismo candidato". Sólo la primera crea
             chofer; las demás se conservan como aparición no aplicada.
          c) CI repetida, candidatos DIFERENTES . TODAS quedan `conflicto`
             con el error "CI asociada a diferentes candidatos".
             NO se elige una automáticamente y NINGUNA crea chofer:
             a qué concejal queda imputado el chofer es una decisión
             política, no del importador.
  D-21  no está en el padrón-> se acepta, marcado `fuera_de_padron`.
                               Por sí solo NO convierte la fila en conflicto.
  D-14  responsable         -> supervisor de la fila, o el concejal si no hay.

Regla de integridad sobre `personas`: un conflicto NUNCA crea identidad.
Sólo las filas `ok` crean persona. Una fila en conflicto se registra en
`apariciones_origen` únicamente si la identidad de esa cédula ya quedó
establecida de forma segura —por una fila `ok` de la misma cédula en este
mismo archivo, o porque la persona ya existía en la base—. Si no hay
identidad segura, la fila queda sólo en `importacion_filas`, que conserva
el crudo, el normalizado y los errores. Nada se pierde: se pospone.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
import psycopg

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

# Clasificación interna de cada CI. NO son valores del enum `fila_estado`:
# viven sólo en memoria y en el informe.
CI_UNICA = "unica"
CI_REPETIDA_MISMO = "repetida_mismo_candidato"
CI_REPETIDA_CRUZADA = "repetida_candidatos_distintos"


######################

def normalizar_candidato(valor):
    """
    Normaliza el nombre del candidato proveniente del Excel.

    El Excel puede traer:
        Concejal Venus Nuñez

    El catálogo contiene:
        Venus Nuñez

    Resultado:
        VENUS NUNEZ
    """
    if not valor:
        return ""

    texto = normalizar_nombre(str(valor))

    if texto.startswith("CONCEJAL "):
        texto = texto[len("CONCEJAL "):].strip()

    return texto


# ==========================================================================
def resolver_catalogos(cur, org, eleccion, df):
    """Mapea los textos libres de la planilla al catálogo."""

    # ------------------------------------------------------------------
    # CANDIDATOS
    # ------------------------------------------------------------------
    cur.execute(
        """select alias_texto, entidad_id
             from alias_catalogo
            where organizacion_id=%s
              and tipo='candidato'""",
        (org,)
    )

    alias_cand = {}

    for alias_texto, entidad_id in cur.fetchall():
        clave = normalizar_candidato(alias_texto)
        if clave:
            alias_cand[clave] = entidad_id

    # Cargar candidatos reales de la elección activa.
    cur.execute(
        """select nombre_publico, id
             from candidatos
            where organizacion_id=%s
              and eleccion_id=%s
              and activo=true""",
        (org, eleccion)
    )

    candidatos = cur.fetchall()

    # nombre_candidato: para poder mostrar en el informe a qué concejales
    # cruza una CI, en vez de un listado de UUID.
    nombre_candidato = {}

    for nombre, cid in candidatos:
        clave = normalizar_candidato(nombre)
        nombre_candidato[str(cid)] = nombre

        if clave:
            alias_cand[clave] = cid

    # ------------------------------------------------------------------
    # BARRIOS
    # ------------------------------------------------------------------
    cur.execute(
        """select nombre, id
             from barrios
            where organizacion_id=%s""",
        (org,)
    )

    barrios = {
        normalizar_nombre(n): i
        for n, i in cur.fetchall()
        if n
    }

    barrios_cortos = {
        k.replace("BARRIO ", ""): v
        for k, v in barrios.items()
    }

    # ------------------------------------------------------------------
    # SUPERVISORES
    # ------------------------------------------------------------------
    supervisores = {}

    textos = sorted({
        str(v).strip()
        for v in df[COL["supervisor"]].dropna()
        if str(v).strip()
    })

    if textos:
        cur.executemany(
            """insert into supervisores(organizacion_id, eleccion_id, alias)
               values (%s,%s,%s)
               on conflict (organizacion_id, eleccion_id, alias)
               do update set alias = excluded.alias
               returning id, alias""",
            [(org, eleccion, alias) for alias in textos],
            returning=True)
        while True:
            for sid, salias in cur.fetchall():
                supervisores[normalizar_nombre(salias)] = sid
            if not cur.nextset():
                break

    return alias_cand, barrios, barrios_cortos, supervisores, nombre_candidato


def buscar_candidato(alias_cand, texto):
    """
    Resuelve el candidato informado en la planilla.

    La planilla puede traer:
        Concejal Venus Nuñez

    mientras el catálogo contiene:
        Venus Nuñez

    No crea candidatos.
    """

    if not texto:
        return None

    clave = normalizar_nombre(texto)

    # 1. Coincidencia directa
    candidato_id = alias_cand.get(clave)

    if candidato_id:
        return candidato_id

    # 2. Quitar prefijo "CONCEJAL"
    if clave.startswith("CONCEJAL "):
        clave_sin_tipo = clave[len("CONCEJAL "):].strip()
        candidato_id = alias_cand.get(clave_sin_tipo)

        if candidato_id:
            return candidato_id

    return None


SQL_APARICION = """
    insert into apariciones_origen(organizacion_id, persona_id, eleccion_id,
        importacion_id, origen_planilla_id, hoja, numero_fila, nombre_texto,
        candidato_texto, barrio_texto, supervisor_texto, estado_texto, fue_aplicada)
    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""


def fila_aparicion(org, persona, eleccion, importacion_id, origen,
                   hoja, pos, norm, aplicada):
    """
    Arma —sin ejecutar— la fila que deja constancia de que esta cédula
    figuró en esta fila de la planilla.

    Se acumula y se inserta en un solo `executemany` al final: hacer una
    consulta por aparición son cientos de viajes de red dentro de la
    transacción, que es lo que colgaba la confirmación contra Supabase.

    Requiere una persona ya existente: nunca la crea.
    `apariciones_origen` no cambia de estructura.
    """
    return (org, persona, eleccion, importacion_id, origen, hoja, pos,
            f"{norm['nombres'] or ''} {norm['apellidos'] or ''}".strip(),
            norm["candidato_txt"], norm["barrio_txt"], norm["supervisor_txt"],
            norm["estado_servicio"], aplicada)


def cargar_padron(cur, cedulas):
    """
    Trae de una sola vez el padrón de todas las cédulas del archivo.

    Antes se consultaba fila por fila: 695 viajes de red dentro de la
    transacción. Con `= any(...)` es uno solo, y el resultado se busca en
    memoria. El dato que devuelve es idéntico.
    """
    if not cedulas:
        return {}
    cur.execute(
        """select p.ci, p.nombre_completo, l.nombre, p.mesa, p.orden
             from padron_electoral p
             join padron_snapshots s on s.id=p.snapshot_id and s.vigente
             left join locales_votacion l on l.id=p.local_votacion_id
            where p.ci = any(%s)""", (list(cedulas),))
    return {r[0]: r for r in cur.fetchall()}


# ==========================================================================
def clasificar_duplicados(filas, nombre_candidato):
    """
    Segunda pasada: decide el estado final de cada fila según cómo se repite
    su cédula. Se hace después de leer todo el archivo porque la fila 10 sólo
    puede clasificarse cuando ya se sabe qué dice la fila 604.

    Devuelve (filas_actualizadas, clasificacion_por_ci, apariciones_por_ci).

    No inventa estados: usa únicamente `ok`, `conflicto` y `rechazada`, que ya
    existen en el enum `fila_estado`.
    """
    indices_por_ci = defaultdict(list)

    for idx, (_imp, _pos, _crudo, norm, estado, _err) in enumerate(filas):
        # Las rechazadas (D-18) no entran en el análisis de duplicados:
        # sin cédula válida no hay identidad que repetir.
        if estado != "rechazada" and norm.get("ci"):
            indices_por_ci[norm["ci"]].append(idx)

    clasificacion = {}
    apariciones = {}

    for ci, indices in indices_por_ci.items():
        candidatos_ci = sorted({
            filas[i][3]["candidato_id"]
            for i in indices
            if filas[i][3].get("candidato_id")
        })

        if len(indices) == 1:
            clasificacion[ci] = CI_UNICA
        elif len(candidatos_ci) > 1:
            clasificacion[ci] = CI_REPETIDA_CRUZADA
        else:
            clasificacion[ci] = CI_REPETIDA_MISMO

        primera_fila = filas[indices[0]][1]
        nombres_cruce = [nombre_candidato.get(c, c) for c in candidatos_ci]

        for orden, i in enumerate(indices):
            imp, pos, crudo, norm, estado, errores = filas[i]
            errores = list(errores)
            aplicable = estado == "ok"

            if clasificacion[ci] == CI_REPETIDA_CRUZADA:
                # Caso (c): nadie se aplica. A qué concejal queda imputado el
                # chofer lo decide una persona, no el importador.
                errores.append({
                    "campo": "ci",
                    "error": "CI asociada a diferentes candidatos",
                    "candidatos": nombres_cruce,
                    "filas": [filas[j][1] for j in indices],
                })
                estado = "conflicto"
                aplicable = False

            elif clasificacion[ci] == CI_REPETIDA_MISMO and orden > 0:
                # Caso (b): repetición del mismo candidato. La primera manda.
                errores.append({
                    "campo": "ci",
                    "error": "CI repetida con el mismo candidato",
                    "primera_fila": primera_fila,
                })
                estado = "conflicto"
                aplicable = False

            norm = dict(norm)
            norm["ci_clasificacion"] = clasificacion[ci]
            norm["aplicable"] = aplicable and estado == "ok"

            filas[i] = (imp, pos, crudo, norm, estado, errores)

        apariciones[ci] = [{
            "fila": filas[i][1],
            "nombre": f"{filas[i][3]['nombres'] or ''} "
                      f"{filas[i][3]['apellidos'] or ''}".strip(),
            "candidato": filas[i][3]["candidato_txt"],
            "barrio": filas[i][3]["barrio_txt"],
            "estado": filas[i][4],
            "aplicable": filas[i][3]["aplicable"],
        } for i in indices]

    return filas, clasificacion, apariciones


# ==========================================================================
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("archivo")
    ap.add_argument("--confirmar", action="store_true",
                    help="aplica al dominio; sin esto sólo llena el staging")
    ap.add_argument("--hoja", default=HOJA)
    ap.add_argument("--eleccion", metavar="AAAA-MM-DD",
                    help="Fecha de la elección a la que pertenecen estas planillas. "
                         "Sin este dato el importador usa la elección ACTIVA, que casi "
                         "nunca es la correcta para una planilla vieja.")
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
    # A qué elección pertenecen estas filas.
    #
    # Esto ya salió mal una vez: el importador tomaba siempre la elección
    # ACTIVA, así que las planillas de la interna del 07/06/2026 entraron
    # como participaciones del operativo del 04/10/2026 y el listado
    # operativo apareció con 599 choferes que nadie había dado de alta.
    # Lo arregló la migración 0007. Para que no se repita, la elección se
    # declara; si no se declara, se avisa fuerte antes de escribir nada.
    if args.eleccion:
        cur.execute("""select id, nombre, fecha from elecciones
                        where organizacion_id=%s and fecha=%s and deleted_at is null""",
                    (org, args.eleccion))
        fila = cur.fetchone()
        if not fila:
            raise SystemExit(f"No hay ninguna elección con fecha {args.eleccion} en el catálogo.")
    else:
        cur.execute("""select id, nombre, fecha from elecciones
                        where organizacion_id=%s and estado='activa' and deleted_at is null
                        order by fecha desc limit 1""", (org,))
        fila = cur.fetchone()
        if not fila:
            raise SystemExit("No hay elección activa. Pasá --eleccion AAAA-MM-DD.")
        print(f"\n  ⚠ Sin --eleccion: se usa la elección ACTIVA.")
        print(f"    Si esta planilla es histórica, esto la carga en el operativo equivocado.\n")

    eleccion, eleccion_nombre, eleccion_fecha = fila
    print(f"  Elección destino: {eleccion_nombre} ({eleccion_fecha})\n")
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

    (alias_cand, barrios, barrios_cortos,
     supervisores, nombre_candidato) = resolver_catalogos(cur, org, eleccion, df)

    # ------------------------------------------------------------------
    # IDEMPOTENCIA. Una importación ya confirmada no se borra ni se repite:
    # `apariciones_origen.importacion_id` la referencia con FK NO ACTION, y
    # además volver a aplicarla duplicaría apariciones.
    # Una importación que quedó en staging sin confirmar sí se reemplaza.
    # ------------------------------------------------------------------
    cur.execute(
        """select id, estado, confirmado_en
             from importaciones
            where organizacion_id=%s and archivo_hash=%s and hoja=%s""",
        (org, sha, args.hoja))
    previa = cur.fetchone()

    if previa:
        previa_id, previa_estado, previa_confirmada = previa

        if previa_estado == "confirmado":
            cur.execute("select count(*) from apariciones_origen where importacion_id=%s",
                        (previa_id,))
            apariciones_previas = cur.fetchone()[0]
            cur.execute("select count(*) from importacion_filas where importacion_id=%s",
                        (previa_id,))
            filas_previas = cur.fetchone()[0]

            print()
            linea("estado", "YA CONFIRMADA")
            linea("importación", str(previa_id))
            linea("confirmada el", str(previa_confirmada)[:19])
            linea("filas en staging", filas_previas)
            linea("apariciones registradas", apariciones_previas)
            print("\n  Este archivo (mismo hash, misma hoja) ya fue aplicado al dominio.")
            print("  No se borra nada, no se duplica nada y no se modifica nada.")
            print("  Para reimportar, usá un archivo distinto o dá de baja la importación")
            print("  anterior desde el sistema, que conserva el historial.")
            con.rollback()
            con.close()
            return 0

        # Staging sin confirmar: se puede reemplazar. Aun así se verifica que
        # nadie dependa de ella, en vez de confiar en el estado.
        cur.execute("select count(*) from apariciones_origen where importacion_id=%s",
                    (previa_id,))
        if cur.fetchone()[0] > 0:
            raise SystemExit(
                f"La importación {previa_id} está en estado '{previa_estado}' pero ya tiene "
                "apariciones asociadas. No se borra. Revisala antes de reimportar.")

        cur.execute("delete from importaciones where id=%s", (previa_id,))
        print(f"\n  Reemplazando staging anterior ({previa_estado}) de este mismo archivo.")

    # ---------------------------------------------------------------- staging
    cur.execute(
        """insert into importaciones(organizacion_id, origen_planilla_id, archivo_nombre,
                                     archivo_hash, hoja, filas_totales, importado_por, estado)
           values (%s,%s,%s,%s,%s,%s,%s,'cargando') returning id""",
        (org, origen, ruta.name, sha, args.hoja, len(df), usuario))
    importacion = cur.fetchone()[0]

    filas = []

    # Padrón de todas las cédulas del archivo, en una sola consulta.
    padron_cache = cargar_padron(
        cur, {c for c in (normalizar_ci(v) for v in df[COL["ci"]]) if c})

    # ------------------------------------------------------------------
    # PRIMERA PASADA: normalizar y validar cada fila por separado.
    # Acá NO se decide nada sobre duplicados: eso necesita el archivo entero.
    # ------------------------------------------------------------------
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
        cand_id = buscar_candidato(alias_cand, cand_txt)

        if cand_txt and not cand_id:
            errores.append({"campo": "candidato", "error": f"no mapeable: {cand_txt}"})
            estado = "rechazada" if estado == "rechazada" else "conflicto"
        nb = normalizar_nombre(barrio_txt)
        barrio_id = barrios.get(nb) or barrios_cortos.get(nb.replace("BARRIO ", ""))
        if barrio_txt and not barrio_id:
            # El barrio no bloquea: un chofer sin barrio se puede asignar igual.
            errores.append({"campo": "barrio", "error": f"no mapeable: {barrio_txt}"})
        super_id = supervisores.get(normalizar_nombre(super_txt))

        # ---- padrón
        # D-21: no estar en el padrón se MARCA, no convierte la fila en
        # conflicto. Una discrepancia de nombre sí, porque puede ser una
        # cédula mal tipeada o una identidad equivocada.
        estado_identidad, padron = "fuera_de_padron", None
        if ci and estado != "rechazada":
            padron = padron_cache.get(ci)
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

        norm["candidato_id"] = str(cand_id) if cand_id else None
        norm["barrio_id"] = str(barrio_id) if barrio_id else None
        norm["supervisor_id"] = str(super_id) if super_id else None
        norm["ci_clasificacion"] = None
        norm["aplicable"] = estado == "ok"

        filas.append((importacion, pos, crudo, norm, estado, errores))

    # ------------------------------------------------------------------
    # SEGUNDA PASADA: D-03. Recién acá se sabe cómo se repite cada cédula.
    # ------------------------------------------------------------------
    filas, clasificacion, apariciones = clasificar_duplicados(filas, nombre_candidato)

    ok = [f[1] for f in filas if f[4] == "ok"]
    rechazadas = [f[1] for f in filas if f[4] == "rechazada"]
    conflictos = [f[1] for f in filas if f[4] == "conflicto"]

    cur.executemany(
        """insert into importacion_filas(importacion_id, numero_fila, datos_crudos,
                                         datos_normalizados, estado, errores)
           values (%s,%s,%s,%s,%s,%s)""",
        [(f[0], f[1], json.dumps(f[2], ensure_ascii=False),
          json.dumps(f[3], ensure_ascii=False), f[4], json.dumps(f[5], ensure_ascii=False))
         for f in filas])

    cur.execute("""update importaciones set filas_ok=%s, filas_error=%s, filas_conflicto=%s,
                          estado='validado' where id=%s""",
                (len(ok), len(rechazadas), len(conflictos), importacion))

    # ---------------------------------------------------------------- informe
    dup = {ci: a for ci, a in apariciones.items() if len(a) > 1}
    cruzadas = {ci: a for ci, a in dup.items()
                if clasificacion[ci] == CI_REPETIDA_CRUZADA}
    mismas = {ci: a for ci, a in dup.items()
              if clasificacion[ci] == CI_REPETIDA_MISMO}

    verificados = sum(1 for f in filas if f[3].get("estado_identidad") == "verificada")
    fuera = sum(1 for f in filas if f[3].get("estado_identidad") == "fuera_de_padron"
                and f[4] != "rechazada")
    discrep = sum(1 for f in filas if f[3].get("estado_identidad") == "discrepancia_nombre")
    sin_tel = sum(1 for f in filas if not f[3]["telefono"] and f[4] != "rechazada")
    sin_cand = sum(1 for f in filas if f[4] == "ok" and not f[3]["candidato_id"])

    # Proyección del dominio. Una cédula sólo tiene identidad si al menos una
    # de sus filas quedó `ok`: los conflictos no crean persona.
    ci_con_ok = {f[3]["ci"] for f in filas if f[4] == "ok" and f[3]["ci"]}
    ci_preexistentes = set()
    cur.execute("select ci from personas where organizacion_id=%s and deleted_at is null", (org,))
    ci_preexistentes = {c for (c,) in cur.fetchall()}
    ci_con_identidad = ci_con_ok | ci_preexistentes

    personas_nuevas = len(ci_con_ok - ci_preexistentes)
    choferes_nuevos = sum(1 for f in filas if f[4] == "ok" and f[3]["candidato_id"])
    apar_aplicadas = choferes_nuevos
    apar_historicas = sum(1 for f in filas
                          if f[4] == "conflicto" and f[3]["ci"] in ci_con_identidad)
    apar_ok_sin_chofer = sum(1 for f in filas if f[4] == "ok" and not f[3]["candidato_id"])
    solo_staging = len(rechazadas) + sum(
        1 for f in filas if f[4] == "conflicto" and f[3]["ci"] not in ci_con_identidad)

    linea("filas leídas", len(df))
    linea("OK", len(ok))
    linea("RECHAZADAS (sin CI válida — D-18)", len(rechazadas))
    linea("con conflicto", len(conflictos))
    print()
    linea("cédulas distintas", len(apariciones))
    linea("cédulas repetidas (D-03)", len(dup))
    linea("filas involucradas en repeticiones", sum(len(a) for a in dup.values()))
    linea("  repetidas con el MISMO candidato", len(mismas),
          f"({sum(len(a) for a in mismas.values())} filas)")
    linea("  repetidas con candidatos DISTINTOS", len(cruzadas),
          f"({sum(len(a) for a in cruzadas.values())} filas)")
    print()
    print("  Motivos por fila (una fila puede tener más de uno):")
    linea("  verificadas contra el padrón", verificados)
    linea("  fuera del padrón — no bloquea (D-21)", fuera)
    linea("  discrepancia de nombre con el padrón", discrep, "→ conflicto")
    linea("  sin candidato mapeable", sin_cand)
    linea("  sin teléfono utilizable", sin_tel)
    print()
    print("  Qué crearía --confirmar:")
    linea("  personas nuevas", personas_nuevas)
    linea("  choferes", choferes_nuevos)
    linea("  asignaciones vigentes", choferes_nuevos)
    linea("  apariciones aplicadas (fue_aplicada=true)", apar_aplicadas)
    linea("  apariciones históricas (fue_aplicada=false)",
          apar_historicas + apar_ok_sin_chofer)
    linea("  filas que quedan SÓLO en staging", solo_staging)
    print()
    linea("supervisores del catálogo", len(supervisores))

    if mismas:
        print("\n  Repetidas con el MISMO candidato — la primera queda OK, "
              "el resto en conflicto:")
        for ci, aps in sorted(mismas.items(), key=lambda x: -len(x[1]))[:4]:
            print(f"    {ci}  ×{len(aps)}  {aps[0]['nombre']}")
            for a in aps:
                marca = "OK        " if a["aplicable"] else "conflicto "
                print(f"        fila {a['fila']:>4}  {marca}  "
                      f"{a['candidato'] or '(sin candidato)'}  ·  {a['barrio'] or '(sin barrio)'}")
        if len(mismas) > 4:
            print(f"    … y {len(mismas) - 4} cédulas más (todas en el staging)")

    if cruzadas:
        print("\n  ⚠ Repetidas con candidatos DISTINTOS — todas en conflicto, "
              "ninguna se aplica:")
        for ci, aps in sorted(cruzadas.items(), key=lambda x: -len(x[1]))[:6]:
            print(f"    {ci}  ×{len(aps)}  {aps[0]['nombre']}")
            for a in aps:
                print(f"        fila {a['fila']:>4}  conflicto   "
                      f"{a['candidato'] or '(sin candidato)'}  ·  {a['barrio'] or '(sin barrio)'}")
        if len(cruzadas) > 6:
            print(f"    … y {len(cruzadas) - 6} cédulas más (todas en el staging)")
        print("\n    Estas requieren una decisión humana: a qué concejal queda")
        print("    imputado cada chofer. El importador no la toma por su cuenta.")

    # ---------------------------------------------------------------- aplicar
    if not args.confirmar:
        con.commit()
        print(f"\n  Staging guardado (importación {importacion}). No se tocó el dominio.")
        print("  Para aplicar:  … choferes.py <archivo> --confirmar")
        con.close()
        return 0

    # ==================================================================
    # APLICACIÓN POR LOTES
    #
    # La versión anterior hacía una consulta por fila: ~4.880 viajes de ida
    # y vuelta dentro de una sola transacción. Contra una base remota son
    # entre 12 y 30 minutos con la transacción abierta, y cualquier corte de
    # red en el medio deja el proceso colgado esperando en recv().
    #
    # Acá se agrupa todo en ~10 sentencias. La lógica de negocio es la misma:
    # las mismas filas se aplican, las mismas quedan en staging y
    # `fue_aplicada` vale lo mismo. Sólo cambia cómo viaja por la red.
    # ==================================================================
    creados = reutilizados = sin_candidato = 0
    apar_aplicada = apar_historica = pospuestas = 0

    # ---- prefetch: todo el estado previo en 4 consultas -----------------
    cur.execute("select ci, id from personas where organizacion_id=%s and deleted_at is null",
                (org,))
    persona_por_ci = dict(cur.fetchall())

    cur.execute("""select persona_id, id from choferes
                    where eleccion_id=%s and deleted_at is null and estado <> 'baja'""",
                (eleccion,))
    chofer_por_persona = dict(cur.fetchall())

    cur.execute("select chofer_id from asignaciones where vigente_hasta is null")
    con_asignacion = {r[0] for r in cur.fetchall()}

    cur.execute("""select v.chapa, v.id from vehiculos v
                    where v.organizacion_id=%s and v.chapa is not null and v.deleted_at is null""",
                (org,))
    vehiculo_por_chapa = dict(cur.fetchall())

    cur.execute("select vehiculo_id from chofer_vehiculos where hasta is null")
    vehiculo_ocupado = {r[0] for r in cur.fetchall()}

    aplicables = [f for f in filas if f[4] == "ok" and f[3]["ci"]]

    # ---- 1. personas ----------------------------------------------------
    if aplicables:
        cur.executemany(
            """insert into personas(organizacion_id, ci, ci_original, nombres, apellidos,
                                    telefono_e164, telefono_original, padron_ci,
                                    verificado_en_padron, estado_identidad, created_by)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               on conflict (organizacion_id, ci) where deleted_at is null
               do update set telefono_e164 = coalesce(personas.telefono_e164, excluded.telefono_e164)
               returning id, ci""",
            [(org, n["ci"], c.get(COL["ci"]), n["nombres"], n["apellidos"],
              n["telefono"], c.get(COL["telefono"]),
              n["ci"] if n["estado_identidad"] != "fuera_de_padron" else None,
              n["estado_identidad"] != "fuera_de_padron", n["estado_identidad"], usuario)
             for _i, _p, c, n, _e, _err in aplicables],
            returning=True)
        while True:
            for pid, pci in cur.fetchall():
                persona_por_ci[pci] = pid
            if not cur.nextset():
                break

    # ---- 2. vehículos ---------------------------------------------------
    chapas = {}
    for _i, _p, _c, n, _e, _err in aplicables:
        if n["candidato_id"] and n["chapa"]:
            chapas.setdefault(n["chapa"], n)
    if chapas:
        cur.executemany(
            """insert into vehiculos(organizacion_id, chapa, categoria, marca, modelo)
               values (%s,%s,%s,%s,%s)
               on conflict (organizacion_id, chapa) where chapa is not null and deleted_at is null
               do update set marca = coalesce(excluded.marca, vehiculos.marca)
               returning id, chapa""",
            [(org, ch, n["categoria"], n["marca"], n["modelo"]) for ch, n in chapas.items()],
            returning=True)
        while True:
            for vid, vch in cur.fetchall():
                vehiculo_por_chapa[vch] = vid
            if not cur.nextset():
                break

    # ---- 3. choferes ----------------------------------------------------
    # ux_chofer_persona_eleccion: sólo se insertan los que todavía no existen.
    nuevos_chofer = []
    for _i, _p, _c, n, _e, _err in aplicables:
        if not n["candidato_id"]:
            continue
        persona = persona_por_ci[n["ci"]]
        if persona in chofer_por_persona:
            reutilizados += 1
            continue
        nuevos_chofer.append((persona, n))

    if nuevos_chofer:
        cur.executemany(
            """insert into choferes(organizacion_id, persona_id, eleccion_id,
                   estado_servicio, estado, origen_planilla_id, declarado_por,
                   responsable_supervisor_id, responsable_candidato_id, created_by)
               values (%s,%s,%s,%s,'activo',%s,%s,%s,%s,%s) returning id, persona_id""",
            [(org, persona, eleccion, n["estado_servicio"], origen, usuario,
              n["supervisor_id"], None if n["supervisor_id"] else n["candidato_id"], usuario)
             for persona, n in nuevos_chofer],
            returning=True)
        while True:
            for cid, pid in cur.fetchall():
                chofer_por_persona[pid] = cid
                creados += 1
            if not cur.nextset():
                break

    # ---- 4. chofer_vehiculos y asignaciones -----------------------------
    lote_veh, lote_asig, lote_apar = [], [], []

    for importacion_id, pos, _c, n, _e, _err in aplicables:
        persona = persona_por_ci[n["ci"]]
        aplicada = False

        if n["candidato_id"]:
            chofer = chofer_por_persona[persona]

            if n["chapa"]:
                vehiculo = vehiculo_por_chapa.get(n["chapa"])
                # ux_vehiculo_activo: un vehículo, un chofer activo.
                if vehiculo and vehiculo not in vehiculo_ocupado:
                    lote_veh.append((chofer, vehiculo))
                    vehiculo_ocupado.add(vehiculo)

            # ux_asignacion_vigente: una sola asignación vigente por chofer.
            if chofer not in con_asignacion:
                lote_asig.append((chofer, eleccion, n["candidato_id"], n["barrio_id"],
                                  n["supervisor_id"], usuario))
                con_asignacion.add(chofer)

            aplicada = True
        else:
            sin_candidato += 1

        lote_apar.append(fila_aparicion(org, persona, eleccion, importacion_id, origen,
                                        args.hoja, pos, n, aplicada))
        if aplicada:
            apar_aplicada += 1
        else:
            apar_historica += 1

    if lote_veh:
        cur.executemany(
            "insert into chofer_vehiculos(chofer_id, vehiculo_id) values (%s,%s)", lote_veh)
    if lote_asig:
        cur.executemany(
            """insert into asignaciones(chofer_id, eleccion_id, candidato_id, barrio_id,
                                        supervisor_id, asignado_por)
               values (%s,%s,%s,%s,%s,%s)""", lote_asig)

    # ---- 5. historial de las filas NO aplicadas --------------------------
    # Nunca se crea persona acá. Si la cédula no tiene identidad establecida
    # de forma segura, la fila queda sólo en `importacion_filas`.
    for importacion_id, pos, _c, n, estado, _err in filas:
        if estado in ("ok", "rechazada") or not n["ci"]:
            continue
        persona = persona_por_ci.get(n["ci"])
        if not persona:
            pospuestas += 1
            continue
        lote_apar.append(fila_aparicion(org, persona, eleccion, importacion_id, origen,
                                        args.hoja, pos, n, False))
        apar_historica += 1

    if lote_apar:
        cur.executemany(SQL_APARICION, lote_apar)

    cur.execute("update importaciones set estado='confirmado', confirmado_por=%s, "
                "confirmado_en=now() where id=%s", (usuario, importacion))
    con.commit()

    print()
    linea("choferes creados", creados)
    linea("choferes reutilizados (ya existían)", reutilizados)
    linea("filas OK sin candidato mapeable", sin_candidato)
    print()
    linea("apariciones aplicadas (fue_aplicada=true)", apar_aplicada)
    linea("apariciones históricas (fue_aplicada=false)", apar_historica)
    linea("filas pospuestas — sólo en staging", pospuestas)
    cur.execute("select count(*) from personas where organizacion_id=%s", (org,))
    linea("personas en la base", cur.fetchone()[0])
    print("\n  ✓ Importación confirmada.")
    con.close()
    return 0


def ejecutar() -> int:
    """
    Envoltorio de seguridad.

    Toda la escritura de `main()` vive en una única transacción con un solo
    `commit()` al final. Si algo falla —red caída, Ctrl+C, error de datos—
    acá se hace `rollback()` explícito y la base queda exactamente como
    estaba. No hay confirmación parcial posible.

    Tampoco hay reintentos: si la conexión se cayó, reintentar sobre una
    transacción abortada sólo esconde el problema. Falla, informa y sale.
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
        print("\n  Interrumpido. Se revierte la transacción; nada quedó a medias.")
        return 130
    except psycopg.OperationalError as e:
        print(f"\n  ERROR DE CONEXIÓN: {e}")
        print("  La transacción no llegó a confirmarse: la base quedó intacta.")
        print("  Si estás usando la conexión directa de Supabase, probá el Session Pooler.")
        return 1
    except Exception as e:                      # noqa: BLE001
        print(f"\n  ERROR: {type(e).__name__}: {e}")
        print("  La transacción no llegó a confirmarse: la base quedó intacta.")
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
