/**
 * Espejo puro (sin Supabase) de `supabase/migrations/0028_costos_por_lote.sql`:
 * costo real por lote (aceite/etiqueta/envase/transporte/otros), precio
 * sugerido a partir de ese costo real, y stock por lote (explícito, con
 * fallback FIFO para egresos sin lote asignado). Mismo criterio que
 * `lib/dominio/calculos.ts` § `calcularCostoLoteItems`: estas funciones no
 * leen la base, solo reproducen la aritmética de las vistas para poder
 * testearla con fixtures y para la vista previa en vivo del formulario.
 *
 * Carpeta partida por sub-dominio (antes un solo archivo de 1815 líneas):
 * - `tipos.ts` — IVA, desglose por presentación y precios sugeridos (base
 *   compartida por el resto, sin depender de ninguno).
 * - `aceite.ts` — litros, costo ARS/USD, deuda con el proveedor, tanque.
 * - `etiquetas.ts` — costo unitario con IVA/envío, campo unificado
 *   frente + reverso.
 * - `envasado.ts` — costo vs. a pagar del envase (0038/0053), notas.
 * - `transporte.ts` — % sobre aceite+envase+etiquetas, re-escalado.
 * - `cobranza.ts` — pérdidas, cobranza esperada, saldo, stock por lote,
 *   "costo de la botella" en prosa, comparación entre lotes.
 * - `pedido.ts` — orquestador: arma el pedido completo al proveedor
 *   (`calcularPedido`), importa de todos los anteriores.
 *
 * Todos los símbolos públicos se re-exportan acá para que los importadores
 * sigan usando `@/lib/dominio/costos-lote` sin cambios.
 */

export * from "@/lib/dominio/costos-lote/tipos";
export * from "@/lib/dominio/costos-lote/aceite";
export * from "@/lib/dominio/costos-lote/etiquetas";
export * from "@/lib/dominio/costos-lote/envasado";
export * from "@/lib/dominio/costos-lote/transporte";
export * from "@/lib/dominio/costos-lote/cobranza";
export * from "@/lib/dominio/costos-lote/pedido";
