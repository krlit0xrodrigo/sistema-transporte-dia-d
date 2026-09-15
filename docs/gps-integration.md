# Integración GPS (Traccar) - Fase 9

## Arquitectura de Vinculación

El sistema de Transporte Día D maneja la trazabilidad GPS apoyándose en la tabla `dispositivos_gps`. 
La pantalla de vinculación (`/gps`) ha sido diseñada para prevenir los errores de clasificación ocurridos en elecciones pasadas (D-04):

1. **Vinculación por Cédula (CI)**: A diferencia del sistema anterior que emparejaba por nombre de dispositivo (causando conflictos por homónimos y nombres mal tipeados), ahora el vínculo es estrictamente una Clave Foránea (`chofer_id`). Al vincular en `/gps`, el operador ingresa la CI, y el sistema extrae la participación activa del chofer.
2. **Índices de Unicidad**:
   - `ux_disp_chofer`: Impide que un mismo chofer tenga dos dispositivos activos.
   - `ux_disp_traccar`: Impide que el mismo `device_id` de Traccar esté en dos choferes a la vez.

## Modo Degradado

Dado que el servidor Traccar no está conectado en vivo a este frontend, el sistema opera por defecto en **Modo Degradado**.
Esto significa que:
- La aplicación web (frontend) permite crear las asignaciones lógicas, dejando los dispositivos en estado `activo` (registrado) en nuestra base de datos.
- La ingesta real de coordenadas y el cálculo de la actividad (`actividad_diaria`, `traccar_eventos`) está bloqueada a nivel de Row Level Security (`with check (false)` para `authenticated`). Ningún operador puede inyectar posiciones falsas desde la web.
- **Flujo de Fallback**: Si el Día D el servidor GPS falla por completo, los choferes aparecerán con actividad `sin_datos`. El pago final requerirá que un supervisor autorice la "Excepción de Pago sin GPS" (C3).

## CronJob de Sincronización (Próximo paso en Producción)

Para habilitar el rastreo real, se debe desplegar un *Cron Job Server-side* o Worker que:
1. Haga polling a la API de Traccar (`GET /api/devices`).
2. Actualice la tabla `traccar_eventos` usando una cuenta de servicio (Role `service_role` de Supabase para saltar RLS).
3. Corra la función SQL `fn_procesar_actividad_diaria()` para consolidar los kilómetros recorridos y actualizar el estado a `activo`/`inactivo`.
