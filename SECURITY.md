# SECURITY.md — Seguridad del sistema v2

**Sistema de Gestión de Transporte — Día D, Villa Hayes**
Versión 2.0 — 2026-09-12

---

## 1. Qué estamos protegiendo

| Activo | Sensibilidad | Volumen real |
|---|---|---|
| CI, nombre, teléfono y domicilio de choferes | **Alta** — datos personales identificatorios | 675 hoy, 10.000 diseñado |
| Padrón electoral de Villa Hayes | **Muy alta** — PII masiva de terceros | **35.192 personas** |
| Afiliación partidaria y participación electoral | **Muy alta** | 35.192 |
| Vinculación persona ↔ candidato | **Muy alta** — revela afinidad política | todos los choferes |
| Montos, contratos y pagos | **Alta** — información financiera | todo el operativo |
| Lista negra | **Muy alta** — juicios sobre personas | — |
| Posiciones GPS | **Alta** — ubicación de personas | continuo |
| Bitácora de auditoría | **Alta** — integridad del sistema | creciente |

## 2. Riesgos identificados

### 2.1 Riesgos técnicos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| S1 | `anon key` + tabla sin RLS → descarga total | Crítico | RLS obligatorio; test CI que falla si tabla sin política |
| S2 | `service_role key` filtrada | Crítico | Solo Vercel server-side; prohibida en `NEXT_PUBLIC_*`; escaneo de secretos |
| S3 | Exportación masiva por usuario legítimo | Crítico | Registro, marca de agua, límites, alerta, `datos.exportar_pii` restringido |
| S4 | Funciones `security definer` mal escritas | Alto | `search_path` fijo, revisión obligatoria, tests negativos |
| S5 | RLS con funciones no `stable` → timeouts | Alto | Funciones `stable`, índices de scope, pruebas de carga |
| S6 | Credenciales en repositorio | Alto | Solo variables de entorno; `.env.example` sin valores |
| S7 | Google Sheet compartido públicamente | Crítico | Service Account con acceso específico |
| S8 | PII en logs | Medio | Logger que solo acepta IDs |
| S9 | Cuentas compartidas | Alto | Una cuenta por persona, MFA, detección concurrencia |
| S10 | Sin MFA en caja | Alto | MFA obligatorio para `super_admin`, `admin`, `tesoreria` |
| S11 | Fuerza bruta / enumeración de CI | Medio | Rate limiting en Cloudflare y RPC |
| S12 | Backup sin cifrar | Alto | Backups cifrados; nunca restaurar prod en staging sin anonimizar |
| S13 | Dependencias vulnerables | Medio | Dependabot, `npm audit` en CI |
| S14 | Manipulación de bitácora | Crítico | `audit_log` append-only, sin permisos UPDATE/DELETE |
| S15 | Preview deploy apuntando a producción | Crítico | Proyectos Supabase separados por entorno |

### 2.2 Riesgos de proceso

| # | Riesgo | Mitigación |
|---|---|---|
| S16 | Doble pago por CI duplicado | Índice único `(persona_id, eleccion_id)` + único en `pagos_finales` |
| S17 | Pago sin contraprestación | Pago sin actividad requiere excepción |
| S18 | Folios reutilizados | Libro de folios con estados |
| S19 | Chofer imputado a dos candidatos | Una sola asignación vigente |
| S20 | Decisiones sobre datos baja confiabilidad | Campo `confiabilidad_dato` visible |
| S21 | Fuga entre organizaciones | `organizacion_id` como primera condición de RLS; test aislamiento |
| S22 | Padrón con encoding roto | Re-exportar UTF-8; validación en importador |
| S23 | Histórico mezclado con operación actual | Doble condición: `eleccion_id` + `origen_planilla_id` |

## 3. Controles por capa

### Cloudflare
- WAF con reglas OWASP
- Rate limiting: login (5/min/IP), búsqueda CI (30/min/usuario), exportaciones (60/hora tope grueso)
- Bot management y challenge en `/login`
- Restricción geográfica de rutas administrativas

### Vercel / Next.js
- Todas las rutas `(app)` protegidas por middleware (sesión + rol)
- Cabeceras: `CSP`, `HSTS`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- Server Actions con Zod + verificación de permiso antes de la base
- Sin `NEXT_PUBLIC_` que contenga nada excepto URL y `anon key`
- CSRF nativo; `SameSite=Lax` en cookies

### Supabase
- RLS + `force row level security` en todas las tablas sensibles
- `revoke all on schema public from anon`; solo lo necesario a `authenticated`
- Funciones `security definer` con `set search_path = public, pg_temp`
- Storage privado; acceso solo por URL firmada
- Contraseñas: mínimo 12 caracteres
- MFA obligatorio para roles de escritura
- Sesión de 8h, refresco con rotación
- Point-in-time recovery durante el operativo

### Aplicación
- Enmascaramiento de CI y teléfono en vistas de BD (no en frontend)
- Confirmación explícita para acciones destructivas
- Bloqueo de sesión por inactividad
- Modo solo lectura global activable

## 4. Auditoría

| Evento | Tabla |
|---|---|
| Toda escritura en tablas de dominio | `audit_log` (trigger) |
| Consulta al padrón | `accesos_sensibles` |
| Consulta a lista negra | `accesos_sensibles` |
| Toda exportación | `exportaciones` |
| Login, fallos, cambios de rol | `audit_log` + Auth logs |
| Jobs e importaciones | `importaciones`, logs |

**Propiedades:**
1. **Append-only.** Ningún rol tiene UPDATE/DELETE sobre `audit_log`
2. **Atribuible.** Toda fila lleva `usuario_id` y `rol_efectivo`
3. **Completa.** Trigger en todas las tablas de dominio
4. **Consultable.** Panel con filtros
5. **Retenida.** Indefinida

## 5. Gestión de secretos

| Secreto | Dónde | Rotación |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server, prod) | Trimestral |
| `SUPABASE_ANON_KEY` | Vercel (pública por diseño) | Con el proyecto |
| Google Service Account JSON | Vercel variable | Semestral |
| Traccar credentials | Vercel | Semestral |
| BD credentials | Solo Supabase | — |

`.env.example` contiene **solo nombres**. Escaneo en pre-commit y CI.
Ninguna clave en chat, issue o prompt.

## 6. Reglas de seguridad para desarrollo

- `service_role` **jamás** en navegador ni Client Component
- Solo en Route Handlers, Server Actions y jobs
- Nunca datos reales en tests, fixtures, issues o prompts
- Nunca `DROP`, `TRUNCATE`, `DELETE` sin `WHERE` contra no-local
- Nunca ejecutar migraciones de producción sin aprobación
- Nunca exponer secretos en Git

## 7. Respuesta a incidentes

1. **Detección** — alerta automática o reporte
2. **Contención** — modo solo lectura, revocación de sesión/scope, rotación de claves
3. **Evaluación** — reconstrucción con `audit_log`, `accesos_sensibles`, `exportaciones`
4. **Comunicación** — al responsable siempre; a afectados según revisión legal
5. **Cierre** — informe con causa raíz y corrección

## 8. Entornos

| Entorno | Base | Datos | Acceso |
|---|---|---|---|
| Local | Supabase CLI | Sintéticos (`seed.sql`) | Desarrollador |
| Preview | Supabase separado | Sintéticos | Equipo |
| Staging | Supabase separado | Copia anonimizada | Equipo + QA |
| Producción | Proyecto dedicado | Reales | Restringido, MFA |

**Regla dura:** ningún preview ni staging apunta a la base de producción. Nunca.

**Flujo de despliegue:**

```
DESARROLLO LOCAL → TEST DATABASE → QA COMPLETO → REVISIÓN HUMANA → PRODUCCIÓN
```
