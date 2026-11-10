# Máquinas de estado del sistema: índice

Fecha: 2026-11-10. Commit base: `5e2f082`.

**Si esto contradice al código, vale el código; corregí este archivo en el mismo cambio.**

Este archivo es solo un ÍNDICE. La descripción canónica de cada máquina (estados y transiciones) vive en el comentario de cabecera del archivo de código citado, pegado al tipo o a la función. Acá solo se dice dónde está la verdad y qué RPC o migración la valida en la base. Cada objeto de la base se cita como `nombre` (`00NN_archivo.sql`), con la migración VIGENTE (la última que lo define). No hay números de línea a propósito. Hay un test (`tests/maquinas-de-estado-indice.test.ts`) que falla si una ruta citada deja de existir, si un símbolo citado ya no aparece en su archivo, si la migración citada no define ese nombre, o si una migración posterior redefine la función citada.

Formato de cada ficha: qué es, dónde está la verdad en TS (`archivo` + `símbolo`), qué la valida en la base, y la regla de uso.

## Envío de un formulario (quieto, enviando, enviado)

- TS: `components/ui/use-envio.ts` (`useEnvio`, `EstadoEnvio`). Quien ejecuta: el propio formulario, con `empezar()`, `completar()` y `liberar()`.
- Base: no aplica; es un candado de interfaz contra el doble toque.
- Regla: todo formulario que crea registros con una llamada no idempotente usa `useEnvio`; no usar un `useState` de "guardando" propio. Todo camino de salida con error debe llamar a `liberar()`.

## Guardado con aviso (quieto, enviando, aviso, enviado)

- TS: `components/ui/use-guardado-con-aviso.ts` (`useGuardadoConAviso`, `siguienteEstadoGuardado`, `EstadoGuardado`, `ErrorGuardado`). Construido sobre `useEnvio` (el candado es el suyo). Lo usan `components/revendedores/entrega/use-entrega-form.ts`, `components/revendedores/carga/use-guardado.ts`, `components/comprobante-form/use-guardar-comprobante.ts`, `components/stock/lote-form.tsx` y `components/plata/depositar-form.tsx`.
- Base: no aplica; los avisos (`STOCK_INSUFICIENTE`, `INSUMO_INSUFICIENTE`, `SALDO_INSUFICIENTE`…) los devuelve la RPC de cada formulario y el reintento manda `permitir_negativo`.
- Regla: el flujo "aviso, Guardar igual, reintento con permiso" y el "error de conexión, Reintentar" van por esta máquina; no hay `alerta` + `permitirNegativoRef` sueltos ni detección de conexión por prefijo de texto (es el dato `deConexion` del error). `components/mi/venta-form.tsx` usa un aviso SIN "Guardar igual" a propósito y queda afuera.

## Hoja de confirmación (cerrada, confirmando, enviando, hecha)

- TS: `components/ui/use-confirmacion.ts` (`siguienteEstado`, `useConfirmacion`, `EstadoConfirmacion`).
- Base: no aplica; la acción que dispara tiene su propia validación en la RPC que llame.
- Regla: botones de "Eliminar / Rechazar / Marcar" con hoja usan `useConfirmacion`, no el trío `open` + `saving` + `error`.

## Pago de una revendedora (pendiente, confirmado, rechazado)

- TS: `lib/dominio/pagos-revendedor.ts` (`EstadoPago`, `ESTADO_PAGO_LABELS`, `ESTADO_PAGO_VARIANTE`, `ESTADO_PAGO_PENDIENTE`).
- Base: tabla `pagos_revendedor` (`0040_revendedores_pagos_precios.sql`) con CHECK `pagos_revendedor_estado_coherente` (`0040_revendedores_pagos_precios.sql`). RPC `informar_pago_revendedor` (`0075_informar_pago_revendedor_path_seguro.sql`), `confirmar_pago_revendedor` (`0093_admin_resuelve_pagos_ajenos.sql`) y `rechazar_pago_revendedor` (`0093_admin_resuelve_pagos_ajenos.sql`).
- Quién puede resolver (confirmar o rechazar) un pago lo decide solo `puedeResolverPagoRevendedor`, en `lib/dominio/pagos-revendedor.ts`; lo usan la tarea y el detalle del pago. `tests/estado-pago-check.test.ts` ata `EstadoPago` al CHECK de la base: falla si divergen.
- Regla: colores, etiquetas y filtros salen de las constantes del dominio; no comparar `"pendiente"` a mano. El pendiente se muestra como "Por confirmar" en todas las pantallas (ficha, lista del admin, filtros, detalle en tareas y `/mi`).

## Aviso de depósito de una coordinadora (pendiente, confirmado, rechazado)

- TS: no tiene tipo propio; se lee como string en `lib/data/tareas.ts` (`cargarFuentesTareas`) y se muestra en `components/tareas/confirmar-deposito-rapido.tsx`. Mensaje compartido: `MENSAJE_DEPOSITO_YA_RESUELTO` en `lib/dominio/pagos-revendedor.ts`.
- Base: tabla `depositos_informados` (`0057_coordinador_plata_stock.sql`) con CHECK de estado y `depositos_informados_estado_coherente` (`0057_coordinador_plata_stock.sql`). RPC `informar_deposito_cuenta` (`0071_comprobante_deposito_informado.sql`), `confirmar_deposito_informado` (`0057_coordinador_plata_stock.sql`) y `rechazar_deposito_informado` (`0057_coordinador_plata_stock.sql`).

## Feria y participación

- TS: `lib/dominio/feria-admin.ts` (`EstadoFeria`, `EstadoParticipacion`, `feriaAbierta`, `participacionCerrada`, `ESTADO_FERIA_ABIERTA`). La vista de la revendedora: `lib/dominio/feria-mi.ts` (`accionFeriaInicio`).
- Base: tablas `feria_revendedoras` (`0078_feria_revendedoras.sql`) y `feria_participantes` (`0078_feria_revendedoras.sql`) con CHECK de estado y CHECK `feria_participantes_estado_coherente` (`0081_estados_coherentes.sql`) que ata `estado` con `cerrada_at`. RPC `feria_cerrar` (`0078_feria_revendedoras.sql`), `feria_reabrir` (`0078_feria_revendedoras.sql`), `feria_cerrar_participacion` (`0079_feria_degustacion_carga.sql`), `feria_reabrir_participacion` (`0079_feria_degustacion_carga.sql`), `feria_quitar_participante` (`0082_cerrar_escrituras_directas.sql`) y `feria_cargar_degustacion` (`0079_feria_degustacion_carga.sql`). `feria_quitar_participante` (`0082_cerrar_escrituras_directas.sql`, aplicada en producción el 2026-11-10) borra la fila solo con la feria abierta y sin movimientos. La feria vieja (`feria_productos`, `crear_feria`, `reabrir_feria` y sus vistas) se retiró en `0083_retirar_feria_vieja_segura.sql`, aplicada el mismo día.
- Regla: usar `feriaAbierta` y `participacionCerrada`. Que la revendedora pueda cerrar su feria (recién el día de la feria o después) lo decide solo `sePuedeCerrarMiFeria` (`lib/dominio/feria-mi.ts`); la usan `accionFeriaInicio`, `components/mi/feria-vista.tsx` y `app/(mi)/mi/feria/cerrar/page.tsx`. No repetir la comparación de fechas.

## Hoja "¿Qué pasó?" (datos: sin pedir, cargando, listo, error)

- TS: `components/cargar/cargar-provider.tsx` (`EstadoHoja`, `VIGENCIA_DATOS_HOJA_MS`, `invalidar`). El diagrama de estados está en el comentario de `EstadoHoja`; la presentación en `components/cargar/que-paso-sheet.tsx`.
- Base: no aplica; los datos (revendedoras activas y proveedor) son de solo lectura.
- Regla: una sola unión, no flags sueltos de "cargando" y "error". Los datos vencen a los 5 minutos o con `invalidar()`; además se invalidan solos mientras se está en `/revendedores*`, donde se suman personas; quien cambie esas listas desde otro lado debe invalidar.

## Filtro de ventas de /mi (período y medio, en la URL)

- TS: `lib/dominio/filtro-ventas-mi.ts` (`FiltroAplicadoMi`, `parsearFiltroMi`, `serializarFiltroMi`). Lo usa `components/mi/ventas-filtradas.tsx`.
- Base: no aplica; el filtrado es en el cliente sobre ventas ya cargadas.
- Regla: el filtro APLICADO vive solo en la URL; el borrador de la hoja es estado local hasta "Aplicar". Todo valor de la URL pasa por `parsearFiltroMi` (cae al valor por defecto si es basura) y se escribe con `serializarFiltroMi`.

## Costos del pedido completos (regla repetida en la base y en TS)

- TS: `lib/dominio/tareas.ts` (`faltantesCostosLote`), que decide la tarea "costos incompletos".
- Base: vista `v_lote_costos_completos` (`0044_diferencia_encargado.sql`), una fila por lote y producto, que congela la foto de costo al entregar.
- Regla: las dos son equivalentes salvo el borde de un lote sin items, que la app no puede crear. `tests/costos-completos-vista-vs-ts.test.ts` falla si una migración posterior redefine la vista; en ese caso hay que revisar también `faltantesCostosLote`.

## Deuda del negocio

- TS: `lib/dominio/deudas.ts` (`calcularEstadoDeuda`, que deriva pendiente/parcial/saldada; `calcularSaldoDeuda`, el saldo) y `lib/deudas.ts` (`registrarPagoDeuda`). `deudaSigueDebiendose` es el criterio único de "la deuda todavía se debe" (pantallas y tareas lo usan; no repetir la comparación). No hay una columna de estado: una deuda está saldada cuando `saldada_en` tiene fecha.
- Base: RPC `registrar_pago_deuda` (`0036_fechas_argentina.sql`) fija `saldada_en`; `sincronizar_deuda_aceite_lote` (`0081_estados_coherentes.sql`) mantiene la deuda del aceite y deja `saldada_en` coherente con el saldo al cambiar el monto, sin reabrir una deuda saldada a mano.

## Plata en manos y vía de una rendición

- TS: `lib/dominio/plata.ts` (`ViaRendicion`, `parsearViaRendicion`) y `lib/dominio/movimientos-plata.ts` (a dónde impacta cada movimiento). `ViaPago` de `lib/dominio/carga-revendedor.ts` es un alias del mismo tipo.
- Base: columna `rendiciones.via` (`0037_plata_en_manos.sql`) con CHECK de tres valores y CHECK `rendiciones_via_tenedor_coherente` (`0081_estados_coherentes.sql`) que ata `via` con `tenedor_id`. RPC `registrar_rendicion` (`0055_coordinador.sql`) y `registrar_deposito_cuenta` (`0055_coordinador.sql`).
- Regla: leer `via` de la base con `parsearViaRendicion`; no castear con `as`.

## Pedido (estado derivado)

- TS: `lib/dominio/pedidos-lote.ts` (`estadoPedido`, `EstadoPedido`). Sin estado propio en la base: se deriva de si tiene costos y del saldo. Lo usan la lista y `components/stock/pedido/heroe-pedido.tsx`.
- Base: costos con `fijar_costos_lote` (`0047_deuda_aceite_proveedor.sql`); saldo desde la vista `v_saldo_lote`.

## Rol y acceso de la persona

- TS: `lib/rol-vendedor.ts` (`tieneAccesoValido`, `puedeRevender`, `esCoordinador`, `puedeUsarShellMi`, `puedeSerEncargado`, `FILTRO_ROLES_ENCARGADO`), redirecciones en `lib/supabase/middleware.ts` (`decidirRedireccion`) y destino tras elegir contraseña en `lib/dominio/invitaciones.ts` (`destinoPorRol`).
- Base: `vendedores.rol` con CHECK `vendedores_rol_check` (`0055_coordinador.sql`); funciones `es_admin` (`0018_revendedores.sql`), `es_vendedor` (`0018_revendedores.sql`, alias de `es_admin`), `es_revendedor` (`0018_revendedores.sql`), `puede_revender` (`0026_roles_pendiente_espacio_revendedor.sql`) y `es_coordinador` (`0055_coordinador.sql`).
- Sesión: `VendedorDeSesion` (el recorte de la fila de `vendedores` que viaja con la sesión) y `esAdminActivo`, ambos en `lib/rol-vendedor.ts`, son el único lugar donde se decide "admin activo". Cambios de rol al dar de alta: `TRANSICIONES_ROL` (`lib/dominio/invitaciones.ts`) es el espejo en TS de `asignar_rol_revendedor`; `tests/asignar-rol-rpc-vs-ts.test.ts` falla si la RPC y la tabla divergen.
- Regla: `es_vendedor()` NO significa "cualquier vendedor". Usar las funciones de `lib/rol-vendedor.ts`, no comparar `rol` a mano.

## Verificación de sesión del proxy (usar claims, confirmar con getUser)

- TS: `lib/dominio/verificacion-sesion.ts` (`decidirVerificacionSesion`, `DecisionVerificacion`) decide; `verificarSesion` en `lib/supabase/middleware.ts` la aplica. Camino rápido: `getClaims()` verifica el JWT en el servidor; camino lento: `getUser()` (error o excepción de `getClaims`, claims nulos o raros, o algún flag de cuenta en `true`). Sin identidad verificada el request va a `/login`.
- Base: ninguna (la fuente es el token de Supabase Auth). Los tests están en `tests/verificacion-sesion.test.ts` y `tests/proxy-verificacion-sesion.test.ts`.

## Tipo de entrega (entrega, devolucion)

- TS: `lib/dominio/tipo-entrega.ts` (`TipoEntrega`, `normalizarTipoEntrega`).
- Base: tabla `entregas_revendedor` (`0018_revendedores.sql`) con CHECK de `tipo`; RPC `registrar_entrega_revendedor` (`0080_devolucion_exige_lote.sql`).

## Tareas (derivadas, sin estado propio)

- TS: `lib/dominio/tareas.ts` (cálculo puro; cabecera con las reglas de urgencia y a quién le toca) y `lib/data/tareas.ts` (`cargarFuentesTareas`, junta las fuentes). Una tarea existe mientras su fuente siga pendiente; no se guarda.
- Base: no tiene tabla propia; usa los estados de pagos, depósitos, pedidos, stock y deudas de arriba.

## Carga de un gasto

- TS: `components/gasto-form.tsx` (alta con la RPC `crear_gasto`), `lib/dominio/gastos.ts` (nombres y `ConceptoPago`), `components/gastos/factura-gasto-seccion.tsx` (adjuntar o quitar la factura; el modo de la sección es una sola unión `Estado` con `fase`: ver, subir, elegir y quitar, con el error dentro de la fase que lo produjo, sin flags sueltos).
- Base: `crear_gasto` (`0022_rpcs_solo_admin.sql`), `adjuntar_comprobante_gasto` (`0067_comprobante_en_gastos.sql`) y `quitar_comprobante_gasto` (`0067_comprobante_en_gastos.sql`).

## Hojas de la feria del admin (una sola hoja abierta)

- TS: `components/ferias/participante-feria.tsx` (`HojaAbierta`). Qué hoja está abierta (quitar participante, reabrir, cargar degustación, quitar una degustación) es una sola unión con `tipo`, y `trabajando` guarda el `tipo` en curso; no hay un `useState` por hoja. `tests/participante-feria-transiciones.test.tsx` cubre las transiciones.
- Base: las RPC de la ficha "Feria y participación".
- Regla: una hoja nueva se agrega como variante de `HojaAbierta`, no como otro booleano.

## Carga de una pantalla (cargando, listo, error)

- TS: `components/ui/use-carga.ts` (`useCarga`, `EstadoCarga`) y el aviso `AvisoCarga` de `components/ui/aviso-carga.tsx`. El diagrama de estados está en el comentario de `useCarga`.
- Base: no aplica; son lecturas.
- Regla: una lectura de pantalla cliente que puede fallar usa `useCarga`: un fallo de red o de permisos muestra el aviso con "Probar de nuevo" y no se confunde con "no hay datos". No usar `loading` + `data` sueltos.

## Filtro de gastos (categoría y mes, en la URL)

- TS: `lib/dominio/filtro-gastos.ts` (`FiltroGastos`, `parsearFiltroGastos`, `serializarFiltroGastos`, `categoriaVigente`). Lo usa `app/(app)/gastos/page.tsx`.
- Base: no aplica; la consulta se rehace con el filtro.
- Regla: el filtro aplicado vive solo en la URL (`?c=&m=`), con el mismo molde que el de ventas de /mi. Un valor inválido, o una categoría que no existe entre las cargadas, se ignora.

## Cancelar una cuenta pendiente (dos pasos, no atómicos)

- TS: `lib/dominio/invitaciones.ts` (`motivoNoCancelable`, `esRestoDeAltaDeEstaApp`) y `lib/invitaciones-server.ts` (`borrarCuentaSinAcceso`). La acción `cancelarCuenta` está en `app/(app)/revendedores/invitar/actions.ts`.
- Base: no hay RPC; se borra la fila de `vendedores` y después el usuario de Auth, en dos llamadas que no son atómicas.
- Regla: si el primer paso se hizo y el segundo falla queda un usuario de Auth sin fila de `vendedores`: sin acceso, visible en "Pendientes de entrar" y reintentable solo si `esRestoDeAltaDeEstaApp`. Nunca se borra un usuario de Auth sin fila que no pase `esRestoDeAltaDeEstaApp` y `motivoNoCancelable`.
