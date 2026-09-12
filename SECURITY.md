# SECURITY.md

## Reporte de vulnerabilidades

Si encontrás una vulnerabilidad en este sistema, **no abras un issue público**. Reportala en
privado al responsable de seguridad del proyecto (pendiente de designación — ver
`docs/decisiones-pendientes.md`, D-14).

Incluí: descripción, pasos para reproducir, impacto estimado y, si es posible, una propuesta
de mitigación. No accedas ni descargues datos personales para demostrar el hallazgo.

## Política de seguridad

La política completa —activos protegidos, riesgos, controles por capa, gestión de secretos,
auditoría, cumplimiento y respuesta a incidentes— vive en
[`docs/security.md`](docs/security.md).

## Reglas mínimas para contribuir

1. Ninguna clave, token ni credencial en el repositorio. Sólo nombres en `.env.example`.
2. La `service_role` key de Supabase nunca sale del servidor.
3. Ninguna tabla sin Row Level Security. El CI falla si aparece una.
4. Ningún dato personal real en tests, fixtures, seeds, issues o prompts de IA.
5. Todo PR que toque el esquema incluye test de RLS por rol.
6. `audit_log` es append-only: ningún cambio puede otorgarle permisos de escritura o borrado.
