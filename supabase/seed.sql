-- =====================================================================
-- seed.sql · Catálogos base
-- NUNCA datos personales reales. Los choferes y el padrón entran por el
-- importador, no por acá.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
insert into roles(codigo, nombre, descripcion, nivel) values
  ('super_admin', 'Super administrador', 'Configuración, usuarios, roles, cierre de elección', 100),
  ('admin',       'Administrador del operativo', 'Cupos, catálogos, excepciones, reportes', 90),
  ('coordinador', 'Coordinador de logística', 'Alta y asignación de choferes', 70),
  ('tesoreria',   'Tesorería / Caja', 'Folios, contratos, vales, anticipos, pagos', 70),
  ('supervisor',  'Supervisor / Referente', 'Sus choferes y su barrio', 40),
  ('candidato',   'Candidato / Concejal', 'Consulta de lo suyo', 40),
  ('operador',    'Operador de carga', 'Carga de datos e importación', 30),
  ('auditor',     'Auditor', 'Sólo lectura total + bitácora', 20),
  ('consulta',    'Consulta', 'Sólo lectura limitada, sin PII ni montos', 10)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
insert into permisos(codigo, modulo, descripcion) values
  ('choferes.ver','choferes','Ver choferes'),
  ('choferes.ver_pii','choferes','Ver CI y teléfono completos'),
  ('choferes.crear','choferes','Dar de alta choferes'),
  ('choferes.editar','choferes','Editar choferes'),
  ('choferes.baja','choferes','Dar de baja choferes'),
  ('personas.ver','personas','Ver personas'),
  ('personas.crear','personas','Crear personas'),
  ('personas.editar','personas','Editar personas'),
  ('asignaciones.ver','asignaciones','Ver asignaciones'),
  ('asignaciones.asignar','asignaciones','Asignar chofer'),
  ('asignaciones.reasignar','asignaciones','Reasignar chofer'),
  ('padron.consultar','padron','Consultar el padrón'),
  ('padron.importar','padron','Importar el padrón'),
  ('lista_negra.ver','lista_negra','Ver lista negra'),
  ('lista_negra.gestionar','lista_negra','Agregar a lista negra'),
  ('lista_negra.revocar','lista_negra','Revocar entrada de lista negra'),
  ('excepciones.ver','excepciones','Ver excepciones'),
  ('excepciones.solicitar','excepciones','Solicitar excepción'),
  ('excepciones.aprobar','excepciones','Aprobar excepción'),
  ('cupos.ver','cupos','Ver cupos'),
  ('cupos.definir','cupos','Definir cupos'),
  ('contratos.ver','contratos','Ver contratos'),
  ('contratos.generar','contratos','Generar contrato'),
  ('contratos.firmar','contratos','Marcar contrato como firmado'),
  ('contratos.anular','contratos','Anular contrato'),
  ('folios.ver','folios','Ver folios'),
  ('folios.emitir_serie','folios','Emitir serie de folios'),
  ('folios.anular','folios','Anular folio'),
  ('caja.ver','caja','Ver caja'),
  ('caja.entregar_vale','caja','Marcar vale entregado'),
  ('caja.marcar_anticipo','caja','Marcar anticipo pagado'),
  ('caja.marcar_pago_final','caja','Marcar pago final'),
  ('caja.autorizar_pago','caja','Autorizar pago final'),
  ('caja.cargar_monto','caja','Cargar montos y movimientos'),
  ('caja.arqueo','caja','Arqueo y cierre'),
  ('gps.ver','gps','Ver actividad GPS'),
  ('gps.gestionar_dispositivos','gps','ABM de dispositivos'),
  ('gps.recalcular','gps','Recalcular actividad'),
  ('datos.importar','datos','Importar datos'),
  ('datos.confirmar_importacion','datos','Confirmar importación'),
  ('datos.exportar','datos','Exportar'),
  ('datos.exportar_pii','datos','Exportar con datos personales'),
  ('reportes.ver','reportes','Ver reportes'),
  ('reportes.ver_montos','reportes','Ver montos en reportes'),
  ('auditoria.ver','auditoria','Ver bitácora'),
  ('auditoria.exportar','auditoria','Exportar bitácora'),
  ('admin.usuarios','admin','Gestionar usuarios'),
  ('admin.roles','admin','Gestionar roles y scopes'),
  ('admin.catalogos','admin','Gestionar catálogos'),
  ('admin.elecciones','admin','Gestionar elecciones'),
  ('admin.modo_lectura','admin','Activar modo solo lectura')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Matriz rol × permiso  (docs/permissions.md §4)
-- ---------------------------------------------------------------------
-- super_admin: todo
insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r cross join permisos p where r.codigo = 'super_admin'
on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','choferes.ver_pii','choferes.crear','choferes.editar','choferes.baja',
  'personas.ver','personas.crear','personas.editar',
  'asignaciones.ver','asignaciones.asignar','asignaciones.reasignar',
  'padron.consultar','padron.importar',
  'lista_negra.ver','lista_negra.gestionar','lista_negra.revocar',
  'excepciones.ver','excepciones.solicitar','excepciones.aprobar',
  'cupos.ver','cupos.definir','contratos.ver','contratos.generar','contratos.firmar','contratos.anular',
  'folios.ver','folios.emitir_serie','folios.anular',
  'caja.ver','caja.autorizar_pago','caja.cargar_monto','caja.arqueo',
  'gps.ver','gps.gestionar_dispositivos','gps.recalcular',
  'datos.importar','datos.confirmar_importacion','datos.exportar','datos.exportar_pii',
  'reportes.ver','reportes.ver_montos','auditoria.ver','auditoria.exportar',
  'admin.usuarios','admin.catalogos','admin.elecciones','admin.modo_lectura'
]) where r.codigo = 'admin' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','choferes.ver_pii','choferes.crear','choferes.editar','choferes.baja',
  'personas.ver','personas.crear','personas.editar',
  'asignaciones.ver','asignaciones.asignar','asignaciones.reasignar',
  'padron.consultar','lista_negra.ver','excepciones.ver','excepciones.solicitar',
  'cupos.ver','contratos.ver','contratos.generar',
  'gps.ver','gps.gestionar_dispositivos','datos.importar','datos.exportar','reportes.ver'
]) where r.codigo = 'coordinador' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','choferes.ver_pii','personas.ver','asignaciones.ver','cupos.ver',
  'contratos.ver','contratos.generar','contratos.firmar',
  'folios.ver','caja.ver','caja.entregar_vale','caja.marcar_anticipo',
  'caja.marcar_pago_final','caja.cargar_monto','caja.arqueo',
  'excepciones.solicitar','datos.exportar','reportes.ver','reportes.ver_montos'
]) where r.codigo = 'tesoreria' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','choferes.ver_pii','choferes.editar','personas.ver','asignaciones.ver',
  'cupos.ver','gps.ver','excepciones.solicitar','datos.exportar'
]) where r.codigo = 'supervisor' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','personas.ver','asignaciones.ver','cupos.ver','gps.ver','datos.exportar'
]) where r.codigo = 'candidato' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','choferes.ver_pii','choferes.crear','choferes.editar',
  'personas.ver','personas.crear','personas.editar','asignaciones.ver',
  'padron.consultar','cupos.ver','gps.ver','datos.importar','datos.exportar'
]) where r.codigo = 'operador' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','choferes.ver_pii','personas.ver','asignaciones.ver','padron.consultar',
  'lista_negra.ver','excepciones.ver','cupos.ver','contratos.ver','folios.ver','caja.ver',
  'caja.arqueo','gps.ver','datos.exportar','reportes.ver','reportes.ver_montos',
  'auditoria.ver','auditoria.exportar'
]) where r.codigo = 'auditor' on conflict do nothing;

insert into rol_permisos(rol_id, permiso_id)
select r.id, p.id from roles r join permisos p on p.codigo = any(array[
  'choferes.ver','asignaciones.ver','cupos.ver','gps.ver'
]) where r.codigo = 'consulta' on conflict do nothing;

-- ---------------------------------------------------------------------
-- Locales de votación (los 7 reales del padrón de Villa Hayes)
-- ---------------------------------------------------------------------
insert into locales_votacion(codigo, nombre, zona) values
  ('1',   'Lic. Nac. Defensores del Chaco',                 '0 VILLA HAYES'),
  ('2',   'Esc. N° 125 Pte. Hayes (Rutherford B. Hayes)',   '0 VILLA HAYES'),
  ('3',   'Esc. Defensores del Chaco',                      '0 VILLA HAYES'),
  ('4',   'Col. Nac. Dr. Blas Garay',                       '0 VILLA HAYES'),
  ('501', 'Esc. de Remansito',                              '0 VILLA HAYES'),
  ('504', 'Esc. N° 5925 Don Jorge Gayoso',                  '0 VILLA HAYES'),
  ('509', 'Esc. N° 1152 Gral. Patricio Colman',             '6 POZO COLORADO')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- Organización y elecciones
-- ---------------------------------------------------------------------
insert into organizaciones(id, codigo, nombre) values
  ('00000000-0000-0000-0000-0000000000a1', 'dia-d-vh', 'Operativo Día D — Villa Hayes')
on conflict (codigo) do nothing;

insert into elecciones(id, organizacion_id, nombre, tipo, fecha, estado) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1',
   'Internas ANR Municipales', 'interna', '2026-06-07', 'cerrada'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1',
   'Día D — Municipales Villa Hayes', 'municipal', '2026-10-04', 'activa')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Barrios (los 23 detectados en las planillas, normalizados)
-- ---------------------------------------------------------------------
insert into barrios(organizacion_id, nombre)
select '00000000-0000-0000-0000-0000000000a1', n from unnest(array[
  'Barrio Alonso','Barrio Golondrina','Barrio San Roque','Barrio Ciudad Nueva',
  'Barrio San Jorge','Barrio Pañete','Barrio Rosa Mística','Remansito','Barrio Cerro',
  'Barrio El Progreso 1, 2 y 3','Barrio Santa Librada','Fernando Congreso',
  'Barrio María Auxiliadora','Barrio El Niño','Tekoporá','Barrio San Miguel',
  'Barrio Pa''i Roberto','Barrio 8 de Diciembre','Barrio Bouvier',
  'Barrio San Juan Bautista','Tercera Edad','Asentamiento Saladillo','Barrio Villa Graciela'
]) as n on conflict do nothing;

-- ---------------------------------------------------------------------
-- Orígenes de planilla
-- ---------------------------------------------------------------------
insert into origenes_planilla(organizacion_id, codigo, nombre, tipo) values
  ('00000000-0000-0000-0000-0000000000a1','logistica_dia_d_choferes','Planilla maestra Choferes','excel'),
  ('00000000-0000-0000-0000-0000000000a1','reporte_07062026','Reporte de actividad 07/06/2026','excel'),
  ('00000000-0000-0000-0000-0000000000a1','carga_web','Carga manual desde el sistema','carga_manual'),
  ('00000000-0000-0000-0000-0000000000a1','google_sheets_inicial','Importación inicial Google Sheets','google_sheets'),
  ('00000000-0000-0000-0000-0000000000a1','contingencia_papel','Conciliación de planillas en papel','contingencia_papel')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Candidatos (los 17 de las planillas). persona_id se completa al importar.
-- ---------------------------------------------------------------------
insert into candidatos(organizacion_id, eleccion_id, nombre_publico, tipo)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', n, 'concejal'
from unnest(array[
  'Venus Nuñez','Negro Nuñez','Ema Gomez','Ariel Escandriolo','Popeye','Tutu Gimenez',
  'Julio Diaz','Lili Irala','Pablina Estigarribia','Derlis Martinez','Gonzalito',
  'Mario Valdez','Noemi Tintel','Estrella Bateman','Nancy Arrua','Kristel Pinho','Liza Ferreira'
]) as n on conflict do nothing;

-- Alias de importación: mapea 'Concejal Venus Nuñez' → el candidato del catálogo.
insert into alias_catalogo(organizacion_id, tipo, entidad_id, alias_texto, origen)
select c.organizacion_id, 'candidato', c.id, 'Concejal ' || c.nombre_publico, 'planilla_choferes'
from candidatos c where c.organizacion_id = '00000000-0000-0000-0000-0000000000a1'
on conflict do nothing;
