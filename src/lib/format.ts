/** Formato para mostrar. La normalización para guardar vive en SQL. */

export function formatearCI(ci: string | null): string {
  if (!ci) return "—";
  return ci.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Enmascara la cédula para roles sin permiso de ver PII. */
export function enmascararCI(ci: string | null): string {
  if (!ci) return "—";
  return ci.length <= 4 ? "****" : "****" + ci.slice(-4);
}

export function formatearTelefono(t: string | null): string {
  if (!t) return "—";
  const m = t.match(/^\+595(\d{3})(\d{3})(\d{3})$/);
  return m ? `0${m[1]} ${m[2]}-${m[3]}` : t;
}

export function formatearKm(km: number | string | null): string {
  if (km === null || km === undefined) return "—";
  const n = typeof km === "string" ? parseFloat(km) : km;
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : "—";
}

export function formatearFecha(f: string | null): string {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-PY", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export const ETIQUETA_IDENTIDAD: Record<string, string> = {
  verificada: "Verificada en el padrón",
  fuera_de_padron: "Fuera del padrón de Villa Hayes",
  discrepancia_nombre: "El nombre no coincide con el padrón",
};

export const ETIQUETA_ACTIVIDAD: Record<string, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  sin_dispositivo: "Sin dispositivo",
  sin_datos: "Sin datos",
};
