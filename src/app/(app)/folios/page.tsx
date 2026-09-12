import { redirect } from "next/navigation";

/**
 * `/folios` era el nombre viejo. En la base el concepto sigue siendo el
 * folio —la serie, el número único, la anulación— porque es lo correcto
 * contablemente; en la pantalla se llama orden de transporte, que es lo
 * que el operador escribe en la planilla y lo que el chofer firma.
 *
 * Este redirect existe para que un enlace guardado o un favorito no se
 * rompa el día del operativo.
 */
export default function FoliosRedirect() {
  redirect("/ordenes");
}
