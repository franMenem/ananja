# Máquinas de estado del sistema: índice

Fecha: 2026-11-09. Commit base: `58ace0b`.

**Si esto contradice al código, vale el código; corregí este archivo en el mismo cambio.**

Este archivo es solo un ÍNDICE. La descripción canónica de cada máquina (estados y transiciones) vive en el comentario de cabecera del archivo de código citado, pegado al tipo o a la función. Acá solo se dice dónde está la verdad y qué RPC o migración la valida en la base. Los nombres de migración son los que definen hoy la función (la última versión); antes de confiar en ellos, releer `supabase/migrations`. No hay números de línea a propósito. Hay un test (`tests/maquinas-de-estado-indice.test.ts`) que falla si una ruta citada deja de existir o si un símbolo citado ya no aparece en su archivo.

Formato de cada ficha: qué es, dónde está la verdad en TS (`archivo` + `símbolo`), qué la valida en la base, y la regla de uso.

## Envío de un formulario (quieto, enviando, enviado)

- TS: `components/ui/use-envio.ts` (`useEnvio`, `EstadoEnvio`). Quien ejecuta: el propio formulario, con `empezar()`, `completar()` y `liberar()`.
- Base: no aplica; es un candado de interfaz contra el doble toque.
- Regla: todo formulario que crea registros con una llamada no idempotente usa `useEnvio`; no usar un `useState` de "guardando" propio. Todo camino de salida con error debe llamar a `liberar()`.

## Hoja de confirmación (cerrada, confirmando, enviando, hecha)

- TS: `components/ui/use-confirmacion.ts` (`siguienteEstado`, `useConfirmacion`, `EstadoConfirmacion`).
- Base: no aplica; la acción que dispara tiene su propia validación en la RPC que llame.
- Regla: botones de "Eliminar / Rechazar / Marcar" con hoja usan `useConfirmacion`, no el trío `open` + `saving` + `error`.

## Pago de una revendedora (pendiente, confirmado, rechazado)

- TS: `lib/dominio/pagos-revendedor.ts` (`EstadoPago`, `ESTADO_PAGO_LABELS`, `ESTADO_PAGO_VARIANTE`, `ESTADO_PAGO_PENDIENTE`, `etiquetaEstadoPagoParaRevendedora`).
- Base: tabla `pagos_revendedor` con CHECK `pagos_revendedor_estado_coherente` (`0040_revendedores_pagos_precios.sql`). RPC `informar_pago_revendedor` (`0075_informar_pago_revendedor_path_seguro.sql`), `confirmar_pago_revendedor` y `rechazar_pago_revendedor` (`0055_coordinador.sql`).
- Regla: colores, etiquetas y filtros salen de las constantes del dominio; no comparar `"pendiente"` a mano. Excepción conocida: el historial de `/mi` dice "Por confirmar" (decisión del dueño pendiente), concentrada en `etiquetaEstadoPagoParaRevendedora`.

## Aviso de depósito de una coordinadora (pendiente, confirmado, rechazado)

- TS: no tiene tipo propio; se lee como string en `lib/data/tareas.ts` (`cargarFuentesTareas`) y se muestra en `components/tareas/confirmar-deposito-rapido.tsx`. Mensaje compartido: `MENSAJE_DEPOSITO_YA_RESUELTO` en `lib/dominio/pagos-revendedor.ts`.
- Base: tabla `depositos_informados` con CHECK de estado y `depositos_informados_estado_coherente` (`0057_coordinador_plata_stock.sql`). RPC `informar_deposito_cuenta` (`0071_comprobante_deposito_informado.sql`), `confirmar_deposito_informado` y `rechazar_deposito_informado` (`0057_coordinador_plata_stock.sql`).

## Feria y participación

- TS: `lib/dominio/feria-admin.ts` (`EstadoFeria`, `EstadoParticipacion`, `feriaAbierta`, `participacionCerrada`, `ESTADO_FERIA_ABIERTA`). La vista de la revendedora: `lib/dominio/feria-mi.ts` (`accionFeriaInicio`).
- Base: tablas `feria_revendedoras` y `feria_participantes` con CHECK de estado (`0078_feria_revendedoras.sql`). RPC `feria_cerrar`, `feria_reabrir` (`0078`), `feria_cerrar_participacion`, `feria_reabrir_participacion`, `feria_quitar_participante`, `feria_cargar_degustacion` (`0079_feria_degustacion_carga.sql`).
- Pendiente (hueco de la base): no hay CHECK que ate `estado` con `cerrada_at` en `feria_participantes`.
- Regla: usar `feriaAbierta` y `participacionCerrada`.

## Deuda del negocio

- TS: `lib/dominio/deudas.ts` (`calcularSaldoDeuda`) y `lib/deudas.ts` (`registrarPagoDeuda`). No hay una columna de estado: una deuda está saldada cuando `saldada_en` tiene fecha.
- Base: `registrar_pago_deuda` (`0036_fechas_argentina.sql`) fija `saldada_en`; la deuda de aceite se mantiene con `sincronizar_deuda_aceite_lote` (`0047_deuda_aceite_proveedor.sql`).
- Pendiente (hueco conocido): `sincronizar_deuda_aceite_lote` no recalcula `saldada_en` cuando cambia el monto.

## Plata en manos y vía de una rendición

- TS: `lib/dominio/plata.ts` (`ViaRendicion`, `parsearViaRendicion`, `medioParaCaja`) y `lib/dominio/movimientos-plata.ts` (a dónde impacta cada movimiento). `ViaPago` de `lib/dominio/carga-revendedor.ts` es un alias del mismo tipo.
- Base: `rendiciones.via` con CHECK de tres valores (`0037_plata_en_manos.sql`). RPC `registrar_rendicion` y `registrar_deposito_cuenta` (`0055_coordinador.sql`).
- Pendiente (hueco conocido): falta un CHECK que ate `via` con `tenedor_id` en `rendiciones`.
- Regla: leer `via` de la base con `parsearViaRendicion`; no castear con `as`.

## Pedido (estado derivado)

- TS: `lib/dominio/pedidos-lote.ts` (`estadoPedido`, `EstadoPedido`). Sin estado propio en la base: se deriva de si tiene costos y del saldo. Lo usan la lista y `components/stock/pedido/heroe-pedido.tsx`.
- Base: costos con `fijar_costos_lote` (`0030_dolar_por_lote.sql`); saldo desde la vista `v_saldo_lote`.

## Rol y acceso de la persona

- TS: `lib/rol-vendedor.ts` (`tieneAccesoValido`, `puedeRevender`, `esCoordinador`, `puedeUsarShellMi`, `puedeSerEncargado`, `FILTRO_ROLES_ENCARGADO`), redirecciones en `lib/supabase/middleware.ts` (`decidirRedireccion`) y destino tras elegir contraseña en `lib/dominio/invitaciones.ts` (`destinoPorRol`).
- Base: `vendedores.rol` con CHECK `vendedores_rol_check` (`0055_coordinador.sql`); funciones `es_admin`, `es_vendedor` (alias de `es_admin`), `es_revendedor` (`0018_revendedores.sql`), `puede_revender` (`0026_roles_pendiente_espacio_revendedor.sql`), `es_coordinador` (`0055_coordinador.sql`).
- Regla: `es_vendedor()` NO significa "cualquier vendedor". Usar las funciones de `lib/rol-vendedor.ts`, no comparar `rol` a mano.

## Tipo de entrega (entrega, devolucion)

- TS: `lib/dominio/tipo-entrega.ts` (`TipoEntrega`, `normalizarTipoEntrega`).
- Base: `entregas_revendedor.tipo` con CHECK (`0018_revendedores.sql`); RPC `registrar_entrega_revendedor` (`0080_devolucion_exige_lote.sql`).

## Tareas (derivadas, sin estado propio)

- TS: `lib/dominio/tareas.ts` (cálculo puro; cabecera con las reglas de urgencia y a quién le toca) y `lib/data/tareas.ts` (`cargarFuentesTareas`, junta las fuentes). Una tarea existe mientras su fuente siga pendiente; no se guarda.
- Base: no tiene tabla propia; usa los estados de pagos, depósitos, pedidos, stock y deudas de arriba.

## Carga de un gasto

- TS: `components/gasto-form.tsx` (alta con la RPC `crear_gasto`), `lib/dominio/gastos.ts` (nombres y `ConceptoPago`), `components/gastos/factura-gasto-seccion.tsx` (adjuntar o quitar la factura).
- Base: `crear_gasto` (`0022_rpcs_solo_admin.sql`), `adjuntar_comprobante_gasto` y `quitar_comprobante_gasto` (`0067_comprobante_en_gastos.sql`).
