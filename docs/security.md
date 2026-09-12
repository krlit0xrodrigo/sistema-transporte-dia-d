# Seguridad

Versión 0.1 (propuesta) · 2026-09-12

---

## 1. Qué estamos protegiendo

| Activo | Sensibilidad | Volumen real |
|---|---|---|
| CI, nombre, teléfono y domicilio de choferes | **Alta** — datos personales identificatorios | 675 hoy, 10.000 diseñado |
| Padrón electoral de Villa Hayes | **Muy alta** — PII masiva de terceros que no participan del operativo | **35.192 personas** |
| Afiliación partidaria y participación electoral (del padrón) | **Muy alta** | 35.192 · ver §6.1 |
| Vinculación persona ↔ candidato | **Muy alta** — revela afinidad política | todos los choferes |
| Montos, contratos y pagos | **Alta** — información financiera y reputacional | todo el operativo |
| Lista negra | **Muy alta** — juicios sobre personas, con daño potencial si se filtra | — |
| Posiciones GPS | **Alta** — ubicación de personas físicas en el tiempo | continuo |
| Bitácora de auditoría | **Alta** — integridad del sistema depende de ella | creciente |

La vinculación persona ↔ candidato combinada con el padrón es el activo más delicado: es
información política sobre personas identificadas. Una filtración no es un problema técnico,
es un problema para las personas que figuran en la base.

## 2. Riesgos identificados

### 2.1 Riesgos técnicos

| # | Riesgo | Impacto | Prob. | Mitigación |
|---|---|---|---|---|
| S1 | **`anon key` expuesta + tabla sin RLS** → cualquiera descarga la base entera desde el navegador | Crítico | Alta si no se controla | RLS obligatorio en toda tabla; test automatizado que falla el CI si existe una tabla sin política |
| S2 | **`service_role key` filtrada** (commit, variable de entorno en cliente, log) | Crítico | Media | Sólo en Vercel server-side; prohibida en `NEXT_PUBLIC_*`; escaneo de secretos en pre-commit y CI; rotación trimestral |
| S3 | Exportación masiva por usuario legítimo (fuga interna) | Crítico | **Alta** | Registro de toda exportación, marca de agua, límites, alerta al admin, permiso `datos.exportar_pii` restringido |
| S4 | Funciones `security definer` mal escritas → bypass de RLS | Alto | Media | `search_path` fijo, revisión obligatoria de todo `security definer`, tests negativos |
| S5 | RLS evaluado por fila con funciones no `stable` → timeouts y caída el Día D | Alto | Media | Funciones `stable`, índices sobre columnas de scope, pruebas de carga con 10.000 filas |
| S6 | Credenciales de Traccar o Google en el repositorio | Alto | Media | Sólo en variables de entorno; `.env.example` sin valores; escaneo de secretos |
| S7 | Google Sheet compartido "con cualquiera que tenga el enlace" | Crítico | **Alta** — es el patrón actual | Service Account con acceso a hojas específicas; prohibición documentada de compartir por enlace |
| S8 | PII en logs de Vercel/Supabase | Medio | Alta | Logger que sólo acepta IDs; revisión de mensajes de error |
| S9 | Cuentas compartidas entre operadores de campo | Alto | **Alta** en este contexto | Una cuenta por persona, MFA, detección de sesiones concurrentes. Refuerza RN-16: si el alta la hace una cuenta compartida, se pierde el responsable |
| S24 | **21 días de desarrollo hasta el operativo** (D-20) | Alto | **Confirmada** | Alcance recortado a un MVP (ver `ROADMAP.md` §2), simulacro el 30/09, congelamiento el 03/10 y paquete de planillas en papel el 02/10 como plan B |
| S10 | Sin MFA en cuentas con acceso a caja | Alto | Media | MFA obligatorio para `super_admin`, `admin`, `tesoreria` |
| S11 | Ataque de fuerza bruta / enumeración de CI en el buscador | Medio | Media | Rate limiting en Cloudflare y a nivel de RPC; registro en `accesos_sensibles` |
| S12 | Backup sin cifrar o restaurado en entorno de prueba con datos reales | Alto | Media | Backups cifrados; prohibido restaurar producción en staging sin anonimizar |
| S13 | Dependencias con vulnerabilidades | Medio | Media | Dependabot, `npm audit` en CI, lockfile fijo |
| S14 | Manipulación de la bitácora para ocultar un fraude | Crítico | Baja | `audit_log` append-only, sin permisos de `update`/`delete` para ningún rol de aplicación |
| S15 | Preview deploy apuntando a producción | Crítico | Media | Proyectos Supabase separados por entorno, validado en CI |
| S21 | **Fuga entre organizaciones** — una política RLS que olvida `organizacion_id` deja ver el operativo de otro (D-12) | Crítico | Media | `organizacion_id` como primera condición de toda política; test pgTAP de aislamiento sobre las 45 tablas; el CI falla si una tabla de dominio no lo tiene |
| S22 | Padrón importado con encoding roto → 2.031 apellidos mal escritos de forma permanente | Alto | **Confirmada** | Re-exportar en UTF-8 antes de importar; validación de encoding en el importador que rechaza archivos con `U+FFFD` |

### 2.2 Riesgos de proceso y datos (heredados de la auditoría)

| # | Riesgo | Mitigación en el diseño |
|---|---|---|
| S16 | Doble pago por CI duplicado | Índice único `(persona_id, eleccion_id)` + índice único en `pagos_finales` |
| S17 | Pago sin contraprestación | El pago final de un chofer sin actividad registrada requiere excepción con aprobador distinto |
| S23 | **Sin montos no se detecta una diferencia de plata** (D-16) | Control documental: folio, autor y fecha en cada marca. La detección de desvíos monetarios queda disponible en cuanto se carguen montos |
| S18 | Folios reutilizados o desaparecidos | Libro de folios con estados y anulación registrada |
| S19 | Chofer imputado a dos candidatos | Una sola asignación vigente por chofer |
| S20 | Decisiones sobre datos de baja confiabilidad (cruce GPS por nombre) | Campo `confiabilidad_dato` visible en la ficha; prohibido liquidar sobre datos `baja` sin revisión |

## 3. Controles por capa

### Cloudflare
- WAF con reglas OWASP.
- Rate limiting: login (5/min/IP), búsqueda por CI (30/min/usuario), exportaciones (5/hora/usuario).
- Bot management y challenge en `/login`.
- Restricción geográfica de rutas administrativas (a evaluar — el equipo puede viajar).
- Registro de solicitudes conservado para el período del operativo.

### Vercel / Next.js
- Todas las rutas bajo `(app)` protegidas por middleware que valida sesión y rol.
- Cabeceras: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva.
- Server Actions con validación Zod y verificación de permiso **antes** de tocar la base.
- Sin `NEXT_PUBLIC_` que contenga nada distinto de la URL y la `anon key` de Supabase.
- Protección CSRF nativa de Server Actions; `SameSite=Lax` en cookies de sesión.

### Supabase
- RLS + `force row level security` en todas las tablas sensibles.
- `revoke all on schema public from anon` y otorgar sólo lo necesario a `authenticated`.
- Funciones `security definer` con `set search_path = public, pg_temp`.
- Storage privado para contratos y evidencias, acceso sólo por URL firmada de corta duración.
- Contraseñas: mínimo 12 caracteres, verificación contra listas de contraseñas filtradas.
- MFA obligatorio para roles de escritura; sesión de 8 h, refresco con rotación.
- Point-in-time recovery activo durante el operativo.

### Aplicación
- Enmascaramiento de CI y teléfono según permiso, resuelto en vistas de base de datos (no en el
  front, que es evadible).
- Confirmación explícita para acciones destructivas o de dinero.
- Bloqueo de sesión por inactividad en dispositivos de campo.
- Modo solo lectura global activable por el admin ante un incidente.

## 4. Auditoría

**Qué se registra**

| Evento | Tabla |
|---|---|
| Toda escritura en tablas de dominio (con valores antes/después) | `audit_log` (trigger) |
| Consulta al padrón | `accesos_sensibles` |
| Consulta a lista negra | `accesos_sensibles` |
| Toda exportación | `exportaciones` |
| Inicio de sesión, fallos, cambios de rol | `audit_log` + Supabase Auth logs |
| Ejecución de jobs (Traccar) e importaciones | `importaciones`, logs |

**Propiedades exigidas**

1. **Append-only.** Ningún rol de aplicación tiene `UPDATE`/`DELETE` sobre `audit_log`.
2. **Atribuible.** Toda fila lleva `usuario_id` y `rol_efectivo`. Los jobs escriben con una
   identidad de servicio identificable, no anónima.
3. **Completa.** El trigger se aplica a todas las tablas de dominio por defecto; excluir una
   requiere justificación en el PR.
4. **Consultable.** Panel de auditoría con filtros por usuario, tabla, registro y rango de fechas.
5. **Retenida.** Conservada al menos lo que dure el operativo más el período de revisión
   posterior (definir — D-10).

**Revisiones periódicas sugeridas:** excepciones aprobadas por aprobador, exportaciones con PII,
accesos al padrón fuera de horario, folios anulados, pagos sin evidencia de actividad.

## 5. Gestión de secretos

| Secreto | Dónde vive | Rotación |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server, producción) | Trimestral y ante cualquier sospecha |
| `SUPABASE_ANON_KEY` | Vercel (pública por diseño) | Con el proyecto |
| Google Service Account JSON | Vercel, como variable única | Semestral |
| `TRACCAR_USER` / `TRACCAR_PASSWORD` o token | Vercel | Semestral |
| Credenciales de base de datos | Nunca fuera de Supabase | — |

`.env.example` contiene **sólo nombres**. Escaneo de secretos en pre-commit y en CI.
Ninguna clave se pega en un chat, un issue o un prompt.

## 6. Cumplimiento y límites de uso

> Esta sección requiere **revisión legal profesional**. Lo que sigue son controles de diseño,
> no asesoramiento jurídico. **D-13: autorizado a avanzar en desarrollo; la confirmación legal
> es compuerta de producción, no de código.**

1. **Volumen real.** El padrón importado son **35.192 personas**, de las cuales sólo 535 son
   choferes del operativo. El 98 % de los datos personales del sistema pertenece a gente que no
   participa de él. Eso define la escala del cuidado.
2. **Base legal del tratamiento** de datos de choferes y del padrón: pendiente de confirmación
   con asesoría legal antes de producción (D-13). Hay que establecer bajo qué norma se tratan
   estos datos en Paraguay y qué exige el TSJE respecto del uso del padrón.
3. **Retención indefinida (D-10).** El sistema no purga nada. Es lo que hace posible el
   histórico de antecedentes entre operativos, y es una decisión tomada conscientemente: si la
   revisión legal del punto 2 fija un plazo, hay que volver acá.
4. **Derechos de las personas.** Debe existir un procedimiento para que alguien solicite acceso,
   rectificación o eliminación de sus datos. El sistema lo soporta técnicamente (borrado lógico
   + anonimización); falta definirlo operativamente.
5. **Terceros.** Traccar aloja datos de ubicación de personas físicas y Google Sheets recibe
   datos personales en la carga inicial. Verificar sus condiciones y dejarlo documentado.

### 6.1 Afiliación partidaria y participación electoral

El padrón recibido incluye dos columnas que no estaban previstas: **afiliación partidaria**
(`partidos`) y **si la persona votó en cada una de 5 elecciones** (`jun2021` … `jun2026`).

Por decisión del responsable del proyecto, ambas **se importan y se consultan sin restricción
especial de acceso**: quedan visibles para los roles que tienen `padron.consultar`, como
cualquier otro campo del padrón. Son datos del padrón oficial, no información generada por el
sistema.

Se mantienen, de todas formas, tres controles que ya estaban en el diseño y no dependen de esta
decisión:

1. **Toda consulta al padrón queda registrada** en `accesos_sensibles`, con usuario, momento y
   qué se consultó. Esto no restringe: deja rastro.
2. **Ninguna regla de negocio lee esas columnas.** Las funciones de alta, de cupo y de caja no
   reciben ni consultan `padron_participacion` ni `partidos`. Es verificable en el código y hay
   un test que lo comprueba.
3. **No existe campo para registrar por quién votó alguien.** El padrón dice si votó, nunca a
   quién, y el sistema no agrega ninguna columna para eso.

**Recomendación del arquitecto, para que quede dicha una vez:** la combinación de "este chofer
cobró" y "este chofer votó" en la misma pantalla es la que conviene no construir, aunque ambos
datos existan por separado. Mantener la separación del punto 2 —ningún cálculo de pago toca la
participación— es barato ahora y difícil de reconstruir después. La decisión de acceso es tuya y
está aplicada; esto es la recomendación técnica que la acompaña.

## 7. Respuesta a incidentes

1. **Detección** — alerta automática (exportación masiva, acceso anómalo, caída de job) o reporte.
2. **Contención** — modo solo lectura, revocación de la sesión y del scope del usuario
   involucrado, rotación de claves si corresponde.
3. **Evaluación** — reconstrucción del alcance con `audit_log`, `accesos_sensibles` y `exportaciones`.
4. **Comunicación** — al responsable del proyecto siempre; a las personas afectadas y a la
   autoridad según lo que determine la revisión legal.
5. **Cierre** — informe con causa raíz, corrección y control nuevo que impida la repetición.

### Responsabilidades (D-14)

**Por cada chofer:** el supervisor o concejal que lo declaró responde por él. Queda registrado
en `choferes.responsable_persona_id` y es obligatorio (RN-16). El reporte "choferes por
responsable" es el primer lugar donde mirar cuando algo sale mal.

**Por el sistema:** rotar claves, revisar accesos, actuar ante un incidente y ejecutar las
revisiones periódicas de esta sección quedan en el **responsable del proyecto**, salvo que se
designe a otra persona. Es un rol distinto y conviene que tenga nombre antes del 3 de octubre.

## 8. Estrategia de testing (seguridad incluida)

| Nivel | Herramienta | Qué cubre | Criterio |
|---|---|---|---|
| Unitario | Vitest | Normalización de CI/teléfono, cálculo de pagos, validadores Zod | ≥ 80 % en `lib/` y `services/` |
| Base de datos | pgTAP | **RLS por rol × tabla × operación**, cupos concurrentes, folios únicos, triggers de auditoría | 100 % de tablas con política probada, incluidos casos negativos |
| Integración | Vitest + Supabase local | RPC completas (`fn_alta_chofer`, `fn_confirmar_importacion`), importador con archivo real anonimizado | Todos los flujos del `workflows.md` |
| E2E | Playwright | Alta de chofer, consulta, excepción, pago, exportación — **una sesión por rol** | Flujos críticos en verde antes de cada release |
| Carga | k6 | 50 usuarios concurrentes, 10.000 choferes, altas simultáneas sobre el mismo cupo | p95 < 1 s, 0 sobre-cupo |
| Seguridad | CI | Escaneo de secretos, `npm audit`, chequeo de "tabla sin RLS", cabeceras HTTP | Bloquea el merge |
| Datos | Scripts de validación | Reglas de calidad sobre la base (duplicados, nulos críticos, folios huérfanos) | Ejecución diaria durante el operativo |

**Datos de prueba:** siempre sintéticos. Generador en `scripts/validation/` que produce CI
válidos ficticios, nombres y teléfonos falsos con la misma distribución de suciedad que los
datos reales (duplicados, nulos, formatos mixtos) para que los tests ejerciten los casos que de
verdad ocurren. **Nunca datos reales en tests, fixtures o issues.**
