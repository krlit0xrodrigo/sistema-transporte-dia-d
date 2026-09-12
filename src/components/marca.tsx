import Image from "next/image";

/**
 * Marcas del operativo.
 *
 * Los archivos viven en `public/marca/`. Al logo de #EquipoMbarete se le
 * quitó el fondo blanco, así que se apoya sobre cualquier superficie clara
 * sin la caja blanca alrededor. El de la ANR conserva su panel blanco a
 * propósito: el texto «Asociación Nacional Republicana» es oscuro y vive
 * sobre ese blanco, así que volarlo dejaría las letras flotando ilegibles
 * sobre el fondo. Los dos van sobre superficie clara, nunca sobre rojo.
 */

export function LogoMbarete({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <Image src="/marca/mbarete.png" alt="Equipo Mbareté"
           width={217} height={128} priority className={className} />
  );
}

export function LogoAnr({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <Image src="/marca/anr.png" alt="Asociación Nacional Republicana"
           width={480} height={161} className={className} />
  );
}

export function AficheCandidato({ className }: { className?: string }) {
  return (
    <Image src="/marca/candidato.jpg" alt="Dr. López — Intendente, Lista 1"
           width={1142} height={1600} priority className={className} />
  );
}
