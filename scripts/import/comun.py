"""
Utilidades compartidas por los importadores.

Las reglas de normalización son las MISMAS que las funciones SQL
(fn_normalizar_ci, fn_normalizar_telefono). Si cambia una, cambia la otra:
el test `scripts/import/test_normalizadores.py` compara ambas.
"""
from __future__ import annotations

import os
import re
import unicodedata
from typing import Optional

import psycopg

# --------------------------------------------------------------------------
# Conexión
# --------------------------------------------------------------------------
def conectar(statement_timeout_ms: int = 120_000,
             tx_idle_timeout_ms: int = 600_000) -> psycopg.Connection:
    """
    Conecta usando DATABASE_URL. Nunca hardcodear credenciales.

    Sobre los parámetros de red: sin keepalives, una conexión que se corta
    del otro lado deja al cliente esperando para siempre en recv(). El
    proceso no falla, no reintenta y no se puede cancelar — se queda
    colgado. Con keepalives el sistema operativo detecta el peer muerto y
    psycopg levanta OperationalError, que sí se puede manejar.

    Los timeouts son de servidor y actúan aunque el cliente esté bloqueado:
      statement_timeout ................ corta una sentencia que se pasa
      idle_in_transaction_session_timeout  corta una transacción abandonada,
                                       liberando los locks que tomó
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            "Falta DATABASE_URL.\n"
            "  Supabase: Project Settings → Database → Connection string (URI)\n"
            "  Local:    postgresql://postgres@/diad_test?host=/tmp&port=54329"
        )

    if ".supabase.co:5432" in url or "db." in url and ":5432" in url:
        print("  ⚠ Estás usando la conexión DIRECTA de Supabase (puerto 5432).\n"
              "    Para cargas largas conviene el Session Pooler (puerto 5432 de\n"
              "    aws-0-<region>.pooler.supabase.com) o el Transaction Pooler (6543):\n"
              "    tolera mejor la latencia y no depende de IPv6.\n"
              "    Project Settings → Database → Connection pooling.")

    con = psycopg.connect(
        url,
        autocommit=False,
        connect_timeout=15,
        # Detección de peer muerto: a los ~30s de silencio empieza a sondear,
        # y tras 5 sondas fallidas la conexión da error en vez de colgarse.
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
        application_name="importador-dia-d",
    )
    with con.cursor() as cur:
        cur.execute("select set_config('statement_timeout', %s, false)",
                    (str(statement_timeout_ms),))
        cur.execute("select set_config('idle_in_transaction_session_timeout', %s, false)",
                    (str(tx_idle_timeout_ms),))
    con.commit()
    return con


# --------------------------------------------------------------------------
# Normalizadores  (espejo de las funciones SQL)
# --------------------------------------------------------------------------
_RE_DECIMAL_CERO = re.compile(r"[.,]0+$")
_RE_NO_DIGITO = re.compile(r"[^0-9]")


def normalizar_ci(valor) -> Optional[str]:
    """
    '4349952.0' -> '4349952'   (Excel agrega el .0; hay que sacarlo ANTES
                                de quitar los no-dígitos, si no queda 43499520)
    '32.713'    -> '32713'     (punto de miles del padrón)
    '004349952' -> '4349952'
    ''/'abc'    -> None
    """
    if valor is None:
        return None
    s = str(valor).strip()
    if not s or s.lower() in ("nan", "none"):
        return None
    s = _RE_DECIMAL_CERO.sub("", s)
    s = _RE_NO_DIGITO.sub("", s)
    s = s.lstrip("0")
    return s or None


def normalizar_telefono(valor) -> Optional[str]:
    """
    '0992511770'   -> '+595992511770'
    '595982387660' -> '+595982387660'
    '0975' / '098' -> None   (truncados: inservibles)
    """
    if valor is None:
        return None
    d = _RE_NO_DIGITO.sub("", str(valor))
    if not d:
        return None
    if d.startswith("595"):
        d = d[3:]
    elif d.startswith("0"):
        d = d[1:]
    return f"+595{d}" if len(d) == 9 else None


def normalizar_nombre(valor) -> str:
    """Sin tildes, mayúsculas, espacios colapsados. Para comparar, no para guardar."""
    if valor is None:
        return ""
    s = unicodedata.normalize("NFKD", str(valor)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def titulo(valor) -> Optional[str]:
    """Capitaliza para guardar: 'DANIEL  BRITEZ ' -> 'Daniel Britez'."""
    if valor is None:
        return None
    s = re.sub(r"\s+", " ", str(valor)).strip()
    if not s or s.lower() in ("nan", "none"):
        return None
    return " ".join(p.capitalize() if p.isupper() or p.islower() else p for p in s.split())


def similitud_nombre(a: str, b: str) -> float:
    """
    Proporción de palabras compartidas sobre el nombre más corto.
    Tolera el orden invertido (padrón guarda 'APELLIDO, NOMBRE').
    """
    A = {w for w in normalizar_nombre(a).replace(",", " ").split() if len(w) > 2}
    B = {w for w in normalizar_nombre(b).replace(",", " ").split() if len(w) > 2}
    if not A or not B:
        return 0.0
    return len(A & B) / min(len(A), len(B))


# --------------------------------------------------------------------------
# Salida por consola
# --------------------------------------------------------------------------
def titulo_seccion(texto: str) -> None:
    print(f"\n{'=' * 68}\n  {texto}\n{'=' * 68}")


def linea(etiqueta: str, valor, sufijo: str = "") -> None:
    print(f"  {etiqueta:.<46} {valor:>8} {sufijo}")
