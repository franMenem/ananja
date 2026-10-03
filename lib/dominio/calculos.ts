/**
 * Espejo en TypeScript de las vistas SQL `v_saldos_caja` y `v_stock_actual`
 * (ver `supabase/migrations/0002_views_rpcs.sql`).
 *
 * Estas funciones NO se usan en producción — la app siempre lee las vistas
 * reales vía Supabase. Existen para poder testear los invariantes de
 * negocio (contracts/database.md) con fixtures puras y rápidas, sin
 * depender de una base. Si cambia la vista SQL, este archivo debe
 * actualizarse en el mismo commit para no perder la cobertura.
 */

export type MedioPago = "banco" | "mercado_pago" | "efectivo";

export interface MovimientoCaja {
  medio_pago: MedioPago;
  /** Centavos, siempre positivo (comprobantes y gastos no llevan signo). */
  monto_centavos: number;
}

export interface AjusteCajaMovimiento {
  medio_pago: MedioPago;
  /** Centavos, con signo (positivo o negativo, nunca cero). */
  monto_centavos: number;
}

export type SaldosIniciales = Record<MedioPago, number>;

export interface SaldoPorCaja {
  medio_pago: MedioPago | "total";
  saldo_centavos: number;
}

export const MEDIOS_PAGO: readonly MedioPago[] = [
  "banco",
  "mercado_pago",
  "efectivo",
];

export interface TransferenciaCajaMovimiento {
  origen: MedioPago;
  destino: MedioPago;
  /** Centavos, siempre positivo — el signo lo da la columna (`origen`
   * resta, `destino` suma), no el monto (mismo criterio que `comprobantes`/
   * `rendiciones`, a diferencia de `ajustes_caja` que sí lleva signo propio). */
  monto_centavos: number;
}

/**
 * Espejo de una fila de `depositos_cuenta`
 * (`supabase/migrations/0037_plata_en_manos.sql`): alguien pasa plata que
 * tiene en mano a la Cuenta Ananja real. `medio_pago` es siempre el DESTINO
 * (`banco` o `mercado_pago`, nunca `efectivo` — lo garantiza un CHECK en la
 * base) — el origen es siempre el pozo 'efectivo' ("en manos de alguien"),
 * sin importar de quién: por eso, a diferencia de `TransferenciaCajaMovimiento`,
 * no tiene un campo `origen` propio.
 */
export interface DepositoCuentaMovimiento {
  medio_pago: MedioPago;
  /** Centavos, siempre positivo. */
  monto_centavos: number;
}

/**
 * Espejo de una fila de `v_saldos_caja` para un único medio de pago:
 *
 * ```sql
 * saldo_inicial_centavos
 *   + sum(comprobantes.cobrado_centavos where medio_pago = c.medio_pago)
 *   - sum(gastos.monto_centavos where medio_pago = c.medio_pago)
 *   + sum(ajustes_caja.monto_centavos where medio_pago = c.medio_pago)
 *   + sum(rendiciones.monto_centavos where medio_pago = c.medio_pago)
 *   - sum(transferencias_caja.monto_centavos where origen = c.medio_pago)
 *   + sum(transferencias_caja.monto_centavos where destino = c.medio_pago)
 *   + sum(cobros.monto_centavos where medio_pago = c.medio_pago)
 * ```
 *
 * `transferencias` (parámetro nuevo, `supabase/migrations/0024_transferencias_caja.sql`
 * § Tareas): a diferencia de `rendiciones` (siempre suma), una transferencia
 * resta del medio que aparece como `origen` y suma al que aparece como
 * `destino` — la misma transferencia afecta dos filas de `v_saldos_caja`
 * con signo opuesto, por eso el total de las tres cajas no cambia (invariante
 * 14, `contracts/database.md`). Default `[]` para no romper las llamadas
 * existentes que no lo pasan.
 *
 * `cobros` (parámetro nuevo, `supabase/migrations/0025_ventas_credito.sql`
 * § Ventas a crédito): plata cobrada después de la venta, en su propio
 * medio de pago (no el de la venta original) — filtra igual que
 * `comprobantes`/`gastos`/`ajustes`, por `medio_pago`. `comprobantes` acá
 * ya no representa "lo vendido" sino "lo cobrado al momento de la venta"
 * (`cobrado_centavos`, no `monto_centavos`) — el caller es responsable de
 * mapear esa columna al armar el `MovimientoCaja[]` con datos reales.
 * Default `[]` para no romper las llamadas existentes que no lo pasan.
 *
 * `pagosDeuda` (parámetro nuevo, `supabase/migrations/0027_pagos_deuda.sql`
 * § Deudas del negocio): plata que salió de una caja para pagar una deuda,
 * en el medio de pago del PAGO (no el de la deuda, que no tiene uno — una
 * deuda solo tiene moneda). Resta como `gastos` (siempre positivo en el
 * array, el signo lo pone esta función); el caller mapea
 * `pagos_deuda.monto_caja_centavos` (pesos que salieron de la caja) a
 * `monto_centavos` del `MovimientoCaja[]`, nunca `pagos_deuda.monto_centavos`
 * (que está en la moneda de la deuda, USD para una deuda en USD). Default
 * `[]` para no romper las llamadas existentes que no lo pasan.
 *
 * `depositos` (parámetro nuevo, `supabase/migrations/0037_plata_en_manos.sql`
 * § Plata en manos de personas): "pasar a la cuenta" — alguien deposita lo
 * que tiene en mano en la Cuenta Ananja real. A diferencia de los demás
 * parámetros, NO se filtra de forma simétrica por `medio`: sale siempre del
 * pozo 'efectivo' (todo depósito lo resta, sin importar su `medio_pago`
 * destino) y entra solo al medio que declara (`banco`/`mercado_pago` — nunca
 * `efectivo`, ver `DepositoCuentaMovimiento`). Default `[]` para no romper
 * las llamadas existentes que no lo pasan.
 *
 * Nota sobre `rendiciones`: esta función NO distingue `via` (0037) — sigue
 * sumando cualquier fila del array al medio que declara, igual que antes.
 * Es responsabilidad del caller construir ese array ya traducido con
 * `medioParaCaja` (`lib/plata.ts`): una rendición 'encargado' se pasa con
 * `medio_pago: 'efectivo'` (todavía no llegó a la Cuenta Ananja, sin
 * importar cómo se la dieron), 'directo_cuenta'/'cliente_directo' con su
 * propio `medio_pago`.
 */
export function calcularSaldo(
  medio: MedioPago,
  saldoInicial: number,
  comprobantes: MovimientoCaja[],
  gastos: MovimientoCaja[],
  ajustes: AjusteCajaMovimiento[],
  rendiciones: MovimientoCaja[] = [],
  transferencias: TransferenciaCajaMovimiento[] = [],
  cobros: MovimientoCaja[] = [],
  pagosDeuda: MovimientoCaja[] = [],
  depositos: DepositoCuentaMovimiento[] = [],
): number {
  const sumaComprobantes = comprobantes
    .filter((c) => c.medio_pago === medio)
    .reduce((acc, c) => acc + c.monto_centavos, 0);

  const sumaGastos = gastos
    .filter((g) => g.medio_pago === medio)
    .reduce((acc, g) => acc + g.monto_centavos, 0);

  const sumaAjustes = ajustes
    .filter((a) => a.medio_pago === medio)
    .reduce((acc, a) => acc + a.monto_centavos, 0);

  const sumaRendiciones = rendiciones
    .filter((r) => r.medio_pago === medio)
    .reduce((acc, r) => acc + r.monto_centavos, 0);

  const sumaTransferenciasSalientes = transferencias
    .filter((t) => t.origen === medio)
    .reduce((acc, t) => acc + t.monto_centavos, 0);

  const sumaTransferenciasEntrantes = transferencias
    .filter((t) => t.destino === medio)
    .reduce((acc, t) => acc + t.monto_centavos, 0);

  const sumaCobros = cobros
    .filter((c) => c.medio_pago === medio)
    .reduce((acc, c) => acc + c.monto_centavos, 0);

  const sumaPagosDeuda = pagosDeuda
    .filter((p) => p.medio_pago === medio)
    .reduce((acc, p) => acc + p.monto_centavos, 0);

  const sumaDepositosSalientes =
    medio === "efectivo"
      ? depositos.reduce((acc, d) => acc + d.monto_centavos, 0)
      : 0;

  const sumaDepositosEntrantes =
    medio === "efectivo"
      ? 0
      : depositos
          .filter((d) => d.medio_pago === medio)
          .reduce((acc, d) => acc + d.monto_centavos, 0);

  return (
    saldoInicial +
    sumaComprobantes -
    sumaGastos +
    sumaAjustes +
    sumaRendiciones -
    sumaTransferenciasSalientes +
    sumaTransferenciasEntrantes +
    sumaCobros -
    sumaPagosDeuda -
    sumaDepositosSalientes +
    sumaDepositosEntrantes
  );
}

/**
 * Espejo completo de `v_saldos_caja`: las tres cajas + la fila "total"
 * (invariante 1 de contracts/database.md: total = Σ de las tres cajas — las
 * transferencias no lo alteran, ver invariante 14; los depósitos a la
 * Cuenta Ananja tampoco, por el mismo motivo — ver 0037_plata_en_manos.sql).
 */
export function calcularSaldos(
  saldosIniciales: SaldosIniciales,
  comprobantes: MovimientoCaja[],
  gastos: MovimientoCaja[],
  ajustes: AjusteCajaMovimiento[],
  rendiciones: MovimientoCaja[] = [],
  transferencias: TransferenciaCajaMovimiento[] = [],
  cobros: MovimientoCaja[] = [],
  pagosDeuda: MovimientoCaja[] = [],
  depositos: DepositoCuentaMovimiento[] = [],
): SaldoPorCaja[] {
  const porCaja = MEDIOS_PAGO.map((medio) => ({
    medio_pago: medio,
    saldo_centavos: calcularSaldo(
      medio,
      saldosIniciales[medio] ?? 0,
      comprobantes,
      gastos,
      ajustes,
      rendiciones,
      transferencias,
      cobros,
      pagosDeuda,
      depositos,
    ),
  }));

  const total = porCaja.reduce((acc, row) => acc + row.saldo_centavos, 0);

  return [...porCaja, { medio_pago: "total", saldo_centavos: total }];
}

export type TipoMovimientoStock = "ingreso" | "egreso";

export interface MovimientoStock {
  tipo: TipoMovimientoStock;
  cantidad: number;
}

/**
 * Espejo de `v_stock_actual.stock`:
 *
 * ```sql
 * sum(cantidad where tipo = 'ingreso') - sum(cantidad where tipo = 'egreso')
 * ```
 *
 * Puede devolver un número negativo — no hay ningún CHECK de base de datos
 * que lo impida (invariante 4: la app permite negativo explícitamente vía
 * `permitir_negativo`, pero la vista simplemente refleja los movimientos
 * tal cual están guardados).
 */
export function calcularStock(movimientos: MovimientoStock[]): number {
  return movimientos.reduce((acc, m) => {
    if (m.tipo === "ingreso") return acc + m.cantidad;
    if (m.tipo === "egreso") return acc - m.cantidad;
    return acc;
  }, 0);
}

/** Espejo de `v_stock_actual.bajo_umbral`: `stock < umbral_minimo`. */
export function calcularBajoUmbral(stock: number, umbralMinimo: number): boolean {
  return stock < umbralMinimo;
}

/**
 * Espejo de `v_costo_lote_item.costo_unitario_centavos`
 * (ver `supabase/migrations/0015_lotes_multi.sql`; hasta 0015 era el
 * espejo de `v_costo_lote.costo_unitario_centavos` de
 * `0010_lotes_produccion.sql` — un lote de una sola presentación es un
 * caso particular de un ítem):
 *
 * ```sql
 * case when total_gastos_centavos = 0 then 0
 *      else round(total_gastos_centavos / cantidad) end
 * ```
 *
 * `cantidad` siempre es > 0 (CHECK de `lote_items`); si no hay gastos
 * asignados todavía el costo unitario es 0, no error.
 */
export function calcularCostoUnitarioLote(
  totalGastosCentavos: number,
  cantidad: number,
): number {
  if (totalGastosCentavos === 0) return 0;
  return Math.round(totalGastosCentavos / cantidad);
}

/**
 * Espejo de `v_costo_producto.costo_unitario_promedio_3_lotes_centavos`:
 * promedio ponderado de los últimos N lotes (los que se le pasen, ya
 * recortados por el caller a los últimos 3 por fecha desc) — suma de
 * gastos totales sobre suma de cantidades, redondeado a entero.
 */
export function calcularCostoUnitarioPromedio(
  lotes: { totalGastosCentavos: number; cantidad: number }[],
): number {
  const totalCantidad = lotes.reduce((acc, l) => acc + l.cantidad, 0);
  if (totalCantidad === 0) return 0;
  const totalGastos = lotes.reduce((acc, l) => acc + l.totalGastosCentavos, 0);
  return Math.round(totalGastos / totalCantidad);
}

/**
 * Espejo de `v_costo_lote_item` (ver `supabase/migrations/0015_lotes_multi.sql`):
 * costo por presentación dentro de un lote con varias presentaciones. Los
 * gastos compartidos (`producto_id = null`) se reparten proporcionalmente
 * al "peso" de cada ítem — volumen = presentación × cantidad, la MISMA
 * regla que el CTE `peso_item` de la vista. `pesoItem` es la ÚNICA función
 * que la conoce: para cambiar de reparto por volumen a reparto por
 * cantidad de unidades, tocar solo esta función acá y el CTE `peso_item`
 * allá — ningún otro código debe reimplementar la fórmula.
 */
export interface LoteItemInput {
  producto_id: string;
  presentacion_ml: number;
  cantidad: number;
}

export interface GastoLoteInput {
  producto_id: string | null;
  monto_centavos: number;
}

export interface CostoLoteItem {
  producto_id: string;
  gastos_directos_centavos: number;
  gastos_compartidos_centavos: number;
  total_gastos_centavos: number;
  costo_unitario_centavos: number;
}

/** Espejo del CTE peso_item de v_costo_lote_item: volumen = presentación × cantidad. */
function pesoItem(item: LoteItemInput): number {
  return item.presentacion_ml * item.cantidad;
}

export function calcularCostoLoteItems(
  items: LoteItemInput[],
  gastos: GastoLoteInput[],
): CostoLoteItem[] {
  const totalCompartido = gastos
    .filter((g) => g.producto_id === null)
    .reduce((acc, g) => acc + g.monto_centavos, 0);

  const pesoTotal = items.reduce((acc, item) => acc + pesoItem(item), 0);

  return items.map((item) => {
    const gastos_directos_centavos = gastos
      .filter((g) => g.producto_id === item.producto_id)
      .reduce((acc, g) => acc + g.monto_centavos, 0);

    // pesoTotal nunca es 0 con datos reales (presentacion_ml y cantidad
    // tienen CHECK > 0), pero se guarda igual para no dividir por cero si
    // se llama con un item mal formado en un test.
    const gastos_compartidos_centavos =
      pesoTotal === 0
        ? 0
        : Math.round((totalCompartido * pesoItem(item)) / pesoTotal);

    const total_gastos_centavos =
      gastos_directos_centavos + gastos_compartidos_centavos;

    const costo_unitario_centavos =
      total_gastos_centavos === 0
        ? 0
        : Math.round(total_gastos_centavos / item.cantidad);

    return {
      producto_id: item.producto_id,
      gastos_directos_centavos,
      gastos_compartidos_centavos,
      total_gastos_centavos,
      costo_unitario_centavos,
    };
  });
}

/**
 * Ganancia (ventas − costos) agrupada por mes o por año — pantalla
 * `/ganancia`. `periodo` sale de recortar `fecha` (`"YYYY-MM-DD"`, mismo
 * formato que `comprobantes.fecha`/`gastos.fecha`): los primeros 7
 * caracteres para mes (`"2026-09"`), los primeros 4 para año (`"2026"`).
 * Un período que solo tiene ventas o solo costos igual aparece en el
 * resultado (el otro lado queda en 0), y el orden es descendente
 * (período más reciente primero).
 *
 * `ventasRevendedor` (parámetro nuevo, `supabase/migrations/0018_revendedores.sql`
 * § decisión 6): las ventas que hace un revendedor se reconocen para
 * Ananja como ventas al precio revendedor (`cantidad × precio_costo`), en
 * el período de la venta real del revendedor — no en el de la entrega ni
 * el de la rendición. El caller ya transforma cada fila de
 * `ventas_revendedor` a `{ fecha, monto_centavos: cantidad *
 * precio_costo_centavos }` antes de llamar (mismo shape que
 * `comprobantes`/`gastos`), así esta función no necesita conocer la forma
 * de `ventas_revendedor`.
 */
export interface FilaGanancia {
  periodo: string;
  ventasCentavos: number;
  costosCentavos: number;
  gananciaCentavos: number;
}

interface MovimientoConFecha {
  fecha: string;
  monto_centavos: number;
}

/**
 * Suma `monto_centavos` de `items` agrupando por período — el prefijo de
 * `fecha` que resulta de cortarla a `largoPeriodo` caracteres: 7 para
 * "YYYY-MM" (mes) o 4 para "YYYY" (año). Núcleo compartido entre
 * `calcularGananciaPorPeriodo` (acá abajo) y `ventasPorAnioMes`
 * (`lib/graficos.ts`), que agrupaban las mismas fuentes con este mismo
 * criterio de forma independiente.
 */
export function sumarPorPeriodo<T extends MovimientoConFecha>(
  items: T[],
  largoPeriodo: number,
): Map<string, number> {
  const porPeriodo = new Map<string, number>();
  for (const item of items) {
    const periodo = item.fecha.slice(0, largoPeriodo);
    porPeriodo.set(periodo, (porPeriodo.get(periodo) ?? 0) + item.monto_centavos);
  }
  return porPeriodo;
}

export function calcularGananciaPorPeriodo(
  comprobantes: MovimientoConFecha[],
  gastos: MovimientoConFecha[],
  granularidad: "mes" | "anio",
  ventasRevendedor: MovimientoConFecha[] = [],
): FilaGanancia[] {
  const largoPeriodo = granularidad === "mes" ? 7 : 4;

  const ventasPorPeriodo = sumarPorPeriodo([...comprobantes, ...ventasRevendedor], largoPeriodo);
  const costosPorPeriodo = sumarPorPeriodo(gastos, largoPeriodo);
  const periodos = new Set([...ventasPorPeriodo.keys(), ...costosPorPeriodo.keys()]);

  return Array.from(periodos)
    .map((periodo) => {
      const ventasCentavos = ventasPorPeriodo.get(periodo) ?? 0;
      const costosCentavos = costosPorPeriodo.get(periodo) ?? 0;
      return {
        periodo,
        ventasCentavos,
        costosCentavos,
        gananciaCentavos: ventasCentavos - costosCentavos,
      };
    })
    .sort((a, b) => (a.periodo < b.periodo ? 1 : a.periodo > b.periodo ? -1 : 0));
}

/**
 * Espejo de la vista `v_precio_item` (ver
 * `supabase/migrations/0016_precios_deudas.sql`): el mismo
 * cálculo paso a paso que la planilla mensual de costo por botella de
 * Fran — materia prima, subtotal, transporte, IVA, costo, ganancia,
 * precio base, precio mayorista. Todos los montos en centavos, redondeando
 * cada paso (`Math.round`, igual que `round()` de Postgres sobre numeric
 * para valores positivos). `precioMinoristaCentavos` no se calcula, es el
 * cargado a mano en el formulario — se devuelve tal cual para que el
 * desglose en vivo lo muestre junto a los demás.
 */
export interface PrecioItemInput {
  dolarCentavos: number;
  materiaPrimaUsdCentavos: number;
  presentacionMl: number;
  envaseCentavos: number;
  etiquetaCentavos: number;
  precioMinoristaCentavos: number;
  transportePct: number;
  ivaPct: number;
  gananciaPct: number;
  mayoristaPct: number;
}

export interface PrecioItemCalculado {
  materiaPrimaCentavos: number;
  subtotalCentavos: number;
  transporteCentavos: number;
  conTransporteCentavos: number;
  ivaCentavos: number;
  costoCentavos: number;
  gananciaCentavos: number;
  precioBaseCentavos: number;
  precioMayoristaCentavos: number;
  precioMinoristaCentavos: number;
}

export function calcularPrecioItem(
  input: PrecioItemInput,
): PrecioItemCalculado {
  const materiaPrimaCentavos = Math.round(
    (input.dolarCentavos * input.materiaPrimaUsdCentavos * input.presentacionMl) /
      100000,
  );
  const subtotalCentavos =
    materiaPrimaCentavos + input.envaseCentavos + input.etiquetaCentavos;
  const transporteCentavos = Math.round(
    (subtotalCentavos * input.transportePct) / 100,
  );
  const conTransporteCentavos = subtotalCentavos + transporteCentavos;
  const ivaCentavos = Math.round((conTransporteCentavos * input.ivaPct) / 100);
  const costoCentavos = conTransporteCentavos + ivaCentavos;
  const gananciaCentavos = Math.round(
    (costoCentavos * input.gananciaPct) / 100,
  );
  const precioBaseCentavos = costoCentavos + gananciaCentavos;
  const precioMayoristaCentavos = Math.round(
    (precioBaseCentavos * (100 + input.mayoristaPct)) / 100,
  );

  return {
    materiaPrimaCentavos,
    subtotalCentavos,
    transporteCentavos,
    conTransporteCentavos,
    ivaCentavos,
    costoCentavos,
    gananciaCentavos,
    precioBaseCentavos,
    precioMayoristaCentavos,
    precioMinoristaCentavos: input.precioMinoristaCentavos,
  };
}

/**
 * Convierte un monto en USD (centavos de dólar) a su equivalente en pesos
 * (centavos de peso) a una cotización dada (centavos de peso por dólar) —
 * usado por el bloque "Deudas" de Caja para mostrar "USD 1.000 ≈ $
 * 1.500.000 al dólar 1.500" (decisión 4 del spec de Precios/Deudas).
 */
export function convertirUsdAPesos(
  usdCentavos: number,
  dolarCentavos: number,
): number {
  return Math.round((usdCentavos * dolarCentavos) / 100);
}

/**
 * Espejo de `v_stock_insumos.stock` (ver
 * `supabase/migrations/0017_insumos.sql`):
 * misma fórmula que `calcularStock` (Σingresos − Σegresos), pero con
 * cantidades fraccionarias (`numeric(12,3)` en la base, no `int`). Se
 * delega directo en `calcularStock` en vez de duplicarla: `number` de JS
 * no distingue enteros de decimales, así que la misma implementación
 * sirve para las dos vistas.
 */
export type MovimientoInsumoInput = MovimientoStock;

export function calcularStockInsumo(movimientos: MovimientoInsumoInput[]): number {
  return calcularStock(movimientos);
}

/**
 * Espejo del descuento de insumos de `crear_lote`
 * (`supabase/migrations/0017_insumos.sql`, decisión 4 del spec de
 * Insumos): por cada ítem del lote, suma `receta.cantidad × item.cantidad`
 * de cada insumo de su receta. Si dos productos del mismo lote comparten
 * un insumo (no pasa con las recetas actuales, pero el cálculo no lo
 * asume), los consumos se suman en una sola fila por `insumo_id`. Un
 * producto sin ninguna receta simplemente no aporta filas.
 */
export interface ItemLoteConsumo {
  producto_id: string;
  cantidad: number;
}

export interface RecetaInput {
  producto_id: string;
  insumo_id: string;
  cantidad: number;
}

export interface ConsumoInsumo {
  insumo_id: string;
  cantidad: number;
}

export function calcularConsumoLote(
  items: ItemLoteConsumo[],
  recetas: RecetaInput[],
): ConsumoInsumo[] {
  const consumoPorInsumo = new Map<string, number>();

  for (const item of items) {
    for (const receta of recetas) {
      if (receta.producto_id !== item.producto_id) continue;
      const previo = consumoPorInsumo.get(receta.insumo_id) ?? 0;
      consumoPorInsumo.set(
        receta.insumo_id,
        previo + receta.cantidad * item.cantidad,
      );
    }
  }

  return Array.from(consumoPorInsumo.entries()).map(([insumo_id, cantidad]) => ({
    insumo_id,
    cantidad,
  }));
}

/**
 * Cuántas unidades de un producto se podrían producir todavía con el
 * stock de insumos disponible ("Aceite en el proveedor: X L ≈ alcanza para N
 * botellas de 500 / M de 250" y el equivalente de etiquetas en `/stock`,
 * ítem 5 del build de Producción): por cada insumo de la receta del
 * producto, `stock ÷ receta.cantidad` (redondeado hacia abajo, nunca
 * negativo) — el insumo más escaso manda (si faltan etiquetas pero sobra
 * aceite, el límite real es el de etiquetas). `null` si el producto no
 * tiene ninguna receta con las filas pasadas (nada con qué estimar, a
 * diferencia de 0 = "no alcanza ni para una").
 *
 * `recetas` puede venir prefiltrada a un solo tipo de insumo (aceite o
 * etiqueta) para calcular cada línea por separado — la función no le pide
 * nada al caller salvo `producto_id`/`insumo_id`/`cantidad`.
 */
export function estimarUnidadesProducibles(
  productoId: string,
  recetas: RecetaInput[],
  stockPorInsumo: Map<string, number>,
): number | null {
  const recetasProducto = recetas.filter(
    (r) => r.producto_id === productoId && r.cantidad > 0,
  );
  if (recetasProducto.length === 0) return null;

  let minimo = Infinity;
  for (const receta of recetasProducto) {
    const stock = stockPorInsumo.get(receta.insumo_id) ?? 0;
    minimo = Math.min(minimo, Math.floor(stock / receta.cantidad));
  }
  return Math.max(minimo, 0);
}

/**
 * Espejo de `v_stock_revendedor.en_poder`
 * (`supabase/migrations/0018_revendedores.sql`): entregado − devuelto −
 * vendido. Puede dar negativo, sin CHECK que lo impida — mismo criterio
 * que `calcularStock`.
 */
export interface CantidadItem {
  cantidad: number;
}

export function calcularStockRevendedor(
  entregas: CantidadItem[],
  devoluciones: CantidadItem[],
  ventas: CantidadItem[],
): number {
  const suma = (items: CantidadItem[]) =>
    items.reduce((acc, i) => acc + i.cantidad, 0);
  return suma(entregas) - suma(devoluciones) - suma(ventas);
}

/**
 * Espejo de `v_resumen_revendedor` (0018, redefinida en
 * 0040_revendedores_pagos_precios.sql): vendido = Σ cantidad×precio_venta
 * de las ventas CON precio; costo = Σ cantidad×precio_costo de todas;
 * ganancia = vendido − costo de las ventas con precio; debe = costo −
 * rendido. Una venta sin precio de venta (cargada por un admin sin saber a
 * cuánto se vendió) suma a la deuda pero no a vendido/ganancia.
 */
export interface VentaRevendedorMonto {
  cantidad: number;
  precioVentaCentavos: number | null;
  precioCostoCentavos: number;
}

export interface RendicionMonto {
  montoCentavos: number;
}

export interface ResumenRevendedor {
  vendidoCentavos: number;
  costoCentavos: number;
  gananciaCentavos: number;
  rendidoCentavos: number;
  debeCentavos: number;
  cantidadVentas: number;
}

export function calcularResumenRevendedor(
  ventas: VentaRevendedorMonto[],
  rendiciones: RendicionMonto[],
): ResumenRevendedor {
  const conPrecio = ventas.filter(
    (v): v is VentaRevendedorMonto & { precioVentaCentavos: number } =>
      v.precioVentaCentavos !== null,
  );
  const vendidoCentavos = conPrecio.reduce(
    (acc, v) => acc + v.cantidad * v.precioVentaCentavos,
    0,
  );
  const costoConPrecioCentavos = conPrecio.reduce(
    (acc, v) => acc + v.cantidad * v.precioCostoCentavos,
    0,
  );
  const costoCentavos = ventas.reduce(
    (acc, v) => acc + v.cantidad * v.precioCostoCentavos,
    0,
  );
  const rendidoCentavos = rendiciones.reduce(
    (acc, r) => acc + r.montoCentavos,
    0,
  );

  return {
    vendidoCentavos,
    costoCentavos,
    gananciaCentavos: vendidoCentavos - costoConPrecioCentavos,
    rendidoCentavos,
    debeCentavos: costoCentavos - rendidoCentavos,
    cantidadVentas: ventas.length,
  };
}

/**
 * Espejo de `v_valor_stock_revendedor`
 * (`supabase/migrations/0051_valor_stock_revendedor.sql`): la vista da una
 * fila por vendedor/producto (misma forma que `v_stock_revendedor`); esto
 * suma esas filas por vendedor para "Valor en poder" en `/revendedores`
 * (mismo patrón que la Map de `en_poder` que ya arma esa página a mano).
 */
export interface ValorStockRevendedorFila {
  vendedorId: string;
  enPoder: number;
  valorEnPoderCentavos: number;
  /** Costo REAL de Ananja del mismo tramo (0059_valor_stock_revendedor_costo_real.sql)
   * — para una revendedora directa coincide con `valorEnPoderCentavos`;
   * para una revendedora de un coordinador es menor (el coordinador cobra
   * con margen). Opcional para no romper a nadie que todavía arme esta
   * fila a mano sin la columna nueva. */
  valorEnPoderAnanjaCentavos?: number;
}

export interface ValorEnPoderRevendedor {
  enPoder: number;
  valorEnPoderCentavos: number;
  valorEnPoderAnanjaCentavos: number;
}

export function agruparValorStockPorVendedor(
  filas: ValorStockRevendedorFila[],
): Map<string, ValorEnPoderRevendedor> {
  const porVendedor = new Map<string, ValorEnPoderRevendedor>();
  for (const fila of filas) {
    const previo = porVendedor.get(fila.vendedorId) ?? {
      enPoder: 0,
      valorEnPoderCentavos: 0,
      valorEnPoderAnanjaCentavos: 0,
    };
    porVendedor.set(fila.vendedorId, {
      enPoder: previo.enPoder + fila.enPoder,
      valorEnPoderCentavos:
        previo.valorEnPoderCentavos + fila.valorEnPoderCentavos,
      valorEnPoderAnanjaCentavos:
        previo.valorEnPoderAnanjaCentavos +
        (fila.valorEnPoderAnanjaCentavos ?? fila.valorEnPoderCentavos),
    });
  }
  return porVendedor;
}

/**
 * "Total" de la fila de un revendedor en `/revendedores`: lo que debe a
 * Ananja por lo ya vendido y no rendido (`v_resumen_revendedor.debe_centavos`)
 * más el valor, a costo Ananja, de lo que todavía tiene sin vender
 * (`v_valor_stock_revendedor.valor_en_poder_centavos`).
 */
export function calcularTotalRevendedor(
  debeCentavos: number,
  valorEnPoderCentavos: number,
): number {
  return debeCentavos + valorEnPoderCentavos;
}

/**
 * Espejo de `v_deuda_cliente` (ver `supabase/migrations/0025_ventas_credito.sql`):
 * vendido = Σ monto_centavos de las ventas del cliente; cobrado = Σ
 * cobrado_centavos de esas ventas + Σ cobros asociados; deuda = vendido −
 * cobrado. `cantidadVentasPendientes` cuenta ventas cuya deuda individual
 * (monto − cobrado_centavos − Σ sus propios cobros) es mayor a 0 — no
 * alcanza con `cobrado_centavos < monto_centavos`: una venta a crédito
 * saldada después con cobros posteriores ya no está pendiente aunque su
 * `cobrado_centavos` original siga siendo menor al monto.
 */
export interface VentaClienteMonto {
  comprobante_id: string;
  monto_centavos: number;
  cobrado_centavos: number;
}

export interface CobroClienteMonto {
  comprobante_id: string;
  monto_centavos: number;
}

export interface DeudaCliente {
  vendidoCentavos: number;
  cobradoCentavos: number;
  deudaCentavos: number;
  cantidadVentasPendientes: number;
}

export function calcularDeudaCliente(
  ventas: VentaClienteMonto[],
  cobros: CobroClienteMonto[],
): DeudaCliente {
  const vendidoCentavos = ventas.reduce((acc, v) => acc + v.monto_centavos, 0);

  const cobrosPorComprobante = new Map<string, number>();
  for (const cobro of cobros) {
    const previo = cobrosPorComprobante.get(cobro.comprobante_id) ?? 0;
    cobrosPorComprobante.set(cobro.comprobante_id, previo + cobro.monto_centavos);
  }

  let cobradoCentavos = 0;
  let cantidadVentasPendientes = 0;

  for (const venta of ventas) {
    const cobrosVenta = cobrosPorComprobante.get(venta.comprobante_id) ?? 0;
    const cobradoVenta = venta.cobrado_centavos + cobrosVenta;
    cobradoCentavos += cobradoVenta;
    if (venta.monto_centavos - cobradoVenta > 0) {
      cantidadVentasPendientes += 1;
    }
  }

  return {
    vendidoCentavos,
    cobradoCentavos,
    deudaCentavos: vendidoCentavos - cobradoCentavos,
    cantidadVentasPendientes,
  };
}
