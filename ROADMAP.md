# ROADMAP

Versión 0.4 — **sprint de 5 días** · 2026-09-12
**Sistema operativo: miércoles 16 de septiembre.** **Día D: domingo 4 de octubre.**

---

## 1. Por qué 5 días sí cierra

El pedido es el MVP completo de la v0.3 en 5 días en lugar de 21. Es agresivo, pero cierra por
tres razones concretas:

1. **La arquitectura ya está hecha.** Las 45 tablas, las políticas RLS, los flujos y las 21
   decisiones están documentadas y cerradas. Lo que queda es escribir, no diseñar.
2. **Los datos ya están auditados.** Sabemos exactamente qué entra, qué se rechaza y qué hay que
   resolver a mano. No hay sorpresas en la importación.
3. **Y la más importante: el Día D sigue siendo el 4 de octubre.** Terminar el 16 no significa
   estrenar el 16. Significa que el equipo tiene **17 días para usarlo, romperlo y arreglarlo**
   antes del día que importa.

Ese tercer punto invierte el riesgo. El plan de 21 días entregaba un sistema sin rodaje dos días
antes del operativo. Este entrega uno con dos semanas y media de uso real encima. **Es el mejor
plan, no sólo el más rápido.**

Lo que 5 días compran es el sistema funcionando. Lo que **no** compran es cobertura de tests
profunda ni endurecimiento — eso va del 17 de septiembre al 3 de octubre, que es tiempo de
sobra.

## 2. El sprint

### Día 1 — sábado 12 · Fundaciones

- Repo, Next.js 15 + TS estricto + Tailwind + shadcn/ui, despliegue vacío en Vercel.
- **Migraciones completas** (esquema, índices, restricciones, RLS, funciones de negocio).
- Supabase Auth, middleware de sesión, los 9 roles con sus scopes.
- Trigger genérico de `audit_log` sobre todas las tablas de dominio.

**Salida:** la base existe, con RLS activo, y cada rol entra y ve lo suyo.

### Día 2 — domingo 13 · Datos adentro

- Importador con staging, normalizadores de CI y teléfono, `alias_catalogo`.
- **Padrón: 35.192 registros + participación.** 🔴 Requiere el CSV en UTF-8.
- **Los 695 choferes:** 20 rechazados sin CI, 64 CI duplicados a resolver, apariciones archivadas.
- Verificación contra padrón: 535 verificados, 70 `fuera_de_padron`.

**Salida:** la base tiene los datos reales, limpios y trazables.

### Día 3 — lunes 14 · Operación

- Alta de chofer con la cadena completa de validaciones.
- Búsqueda por CI y por nombre; ficha con padrón, apariciones y responsable.
- Asignaciones con historial; cupos en cascada con bloqueo transaccional; tablero con semáforo.

**Salida:** se puede dar de alta y asignar de punta a punta.

### Día 4 — martes 15 · Control y caja

- Lista negra: marcar, bloquear, revocar, con el catálogo de motivos aprobado.
- Folios: series, asignación sin repetición bajo concurrencia, anulación.
- Marcas de caja: contrato firmado, vale entregado, anticipo pagado, pago finalizado.

**Salida:** existe el registro que hoy no existe en ningún lado.

### Día 5 — miércoles 16 · Salidas

- **Exportación de planillas por barrio y por candidato (XLSX + PDF).**
- Reportes: resumen, por candidato, por responsable, control de folios.
- Vinculación de dispositivos Traccar por CI.
- Cabeceras de seguridad, rate limiting, registro de exportaciones.
- **Prueba con el equipo real, con datos reales.**

**Salida:** el sistema reemplaza las 21 hojas hechas a mano.

## 3. Del 17 de septiembre al 3 de octubre — Endurecimiento

Acá va lo que el sprint no alcanza a hacer bien, con el sistema ya en uso:

| Período | Trabajo |
|---|---|
| 17–20 sep | Suite pgTAP completa: RLS por rol × tabla, aislamiento entre organizaciones, casos negativos |
| 21–24 sep | Corrección de lo que aparezca con el uso real. Excepciones con flujo de aprobación |
| 25–28 sep | Job de Traccar, clasificación de actividad, e2e con Playwright, prueba de carga |
| 29–30 sep | **Simulacro completo del operativo** |
| 1–2 oct | Capacitación, correcciones finales, **paquete de planillas en papel** |
| 3 oct | Congelamiento, backup, modo solo lectura probado |

## 4. Qué se recorta para que entren 5 días

| Se recorta | Por qué se puede | Cuándo vuelve |
|---|---|---|
| Excepciones con flujo de aprobación | En el sprint es una marca con aprobador y motivo; el circuito completo puede esperar | 21–24 sep |
| Job automático de Traccar | El Día D sólo se ingiere; la clasificación se calcula el 5 de octubre | 25–28 sep |
| Libro de caja y arqueo | Los montos son opcionales (D-16): sin montos no hay nada que arquear | Cuando se carguen montos |
| Pantallas multi-organización | La columna `organizacion_id` va desde la primera migración; la ABM de organizaciones no | Post Día D |
| Panel de auditoría con pantallas | El trigger escribe desde el día 1; la pantalla para leerlo puede esperar | 17–20 sep |
| Cobertura de tests | En el sprint: los 8 flujos críticos. El resto, después | 17–20 sep |
| Capacitación formal | El día 5 hay una prueba con el equipo, no un curso | 1–2 oct |

**Lo que no se recorta:** RLS desde el día 1, bitácora de auditoría desde el día 1, CI obligatorio,
un solo chofer activo por cédula, folios sin repetición y responsable declarado. Eso no se agrega
después: o está en la primera migración o no está nunca.

## 5. Lo que necesito para que esto arranque

| # | Qué | Cuándo | Sin esto |
|---|---|---|---|
| 1 | **Padrón re-exportado en UTF-8** | 🔴 Domingo 13 a primera hora | Se importa igual, con 2.031 apellidos con la Ñ rota, y se corrige después |
| 2 | Proyecto Supabase creado + URL y claves | Sábado 12 | No hay dónde aplicar las migraciones |
| 3 | Cuenta de Vercel conectada al repo | Sábado 12 | No hay dónde desplegar |
| 4 | Lista de usuarios: nombre, email y rol | Lunes 14 | No se puede probar con gente real |
| 5 | **Quién resuelve los 64 CI duplicados** | Domingo 13 | Esos 64 choferes quedan bloqueados hasta que alguien decida |
| 6 | Acceso a Traccar (URL + usuario de lectura) | Miércoles 16 | Se difiere al período de endurecimiento |

## 6. Riesgos de comprimir a 5 días

| Riesgo | Mitigación |
|---|---|
| Bugs que en 21 días se habrían encontrado antes | Los 17 días de endurecimiento existen exactamente para eso, y con uso real |
| Una política RLS mal escrita expone datos | El patrón está documentado y es uniforme; los tests de las 8 tablas críticas van en el sprint, el resto del 17 al 20 |
| El padrón no llega en UTF-8 el domingo | Se importa y se corrige en el período de endurecimiento. No frena el sprint |
| Los duplicados no se resuelven a tiempo | Quedan bloqueados y el sistema opera con los otros 541. No es bloqueante |
| Se pide alcance nuevo durante el sprint | Va a la lista del 17 en adelante. Sin excepción — cambiar el alcance es lo único que puede voltear estos 5 días |

**Lo que sigue sin negociarse:** el paquete de planillas en papel del 2 de octubre. Un sistema de
5 días con 17 de rodaje es sólido, pero el plan B se imprime igual.
