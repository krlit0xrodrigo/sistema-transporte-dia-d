"use server";

import { crearClienteServidor } from "@/lib/supabase/server";

export async function getAuditLog(limit = 100) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching audit_log:", error);
    return [];
  }
  return data;
}

export async function getAccesosSensibles(limit = 100) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("accesos_sensibles")
    .select("*")
    .order("ocurrido_en", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching accesos_sensibles:", error);
    return [];
  }
  return data;
}
