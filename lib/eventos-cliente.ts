/**
 * Nombres de eventos de `window` para coordinar dos componentes cliente que
 * no son padre/hijo, sin pasar estado por props ni un store aparte.
 */

/**
 * "Cargar precios" del resumen de ganancia (`IrAPrecioPendiente`) apunta a
 * `id="sin-precio"` dentro de `MovimientosFicha`. Si esa fila está oculta
 * detrás del recorte de `LIMITE_MOVIMIENTOS_VISIBLES` ("Ver todos los
 * movimientos"), `IrAPrecioPendiente` dispara este evento antes de
 * reintentar el scroll y `MovimientosFicha` lo escucha para expandirse.
 */
export const EVENTO_MOSTRAR_TODOS_MOVIMIENTOS = "ananja:mostrar-todos-movimientos";
