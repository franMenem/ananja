/**
 * Espejo en TypeScript de las vistas SQL nuevas de
 * `supabase/migrations/0037_plata_en_manos.sql`: `v_plata_en_manos`,
 * `v_cuenta_ananja` y `v_deuda_vendedor` — ver la cabecera de esa migración
 * para el diseño completo ("plata en manos de personas" vs. Cuenta Ananja,
 * y la demostración de que `v_saldos_caja.efectivo` reconcilia exactamente
 * con la suma de `v_plata_en_manos`).
 *
 * Mismo criterio que `lib/calculos.ts` (que este archivo complementa, no
 * reemplaza): estas funciones NO se usan en producción — la app siempre lee
 * las vistas reales vía Supabase. Existen para poder testear los
 * invariantes de negocio con fixtures puras y rápidas, sin depender de una
 * base. Si cambia una de las tres vistas, este archivo debe actualizarse en
 * el mismo commit para no perder la cobertura.
 */

import {
  calcularResumenRevendedor,
  type MedioPago,
  type RendicionMonto,
  type SaldoPorCaja,
  type VentaRevendedorMonto,
} from "@/lib/dominio/calculos";

export type ViaRendicion = "encargado" | "directo_cuenta" | "cliente_directo";

/**
 * Traduce una rendición real (`via` + `medio_pago` que cargó el admin) al
 * `medio_pago` que le corresponde para clasificarla dentro de
 * `calcularSaldo`/`calcularSaldos` (`lib/calculos.ts`) — espejo de la
 * expresión `case when via = 'encargado' then 'efectivo' ...` de
 * `v_saldos_caja` (0037_plata_en_manos.sql § 7).
 *
 * Una rendición 'encargado' siempre cae en 'efectivo': todavía no llegó a
 * la Cuenta Ananja, sin importar qué `medio_pago` haya cargado el admin ahí
 * (ese campo pasa a ser solo informativo — "cómo te la dio" — para ese
 * caso). 'directo_cuenta'/'cliente_directo' sí usan su propio `medio_pago`:
 * ya están en la Cuenta Ananja real.
 */
export function medioParaCaja(
  via: ViaRendicion,
  medioPago: MedioPago,
): MedioPago {
  return via === "encargado" ? "efectivo" : medioPago;
}

/**
 * Una fila de un movimiento en efectivo ya atribuido a un tenedor (quien lo
 * tiene en mano) — forma común de comprobantes/cobros/gastos/pagos de deuda/
 * ajustes ya filtrados por el caller a `medio_pago = 'efectivo'`, y de
 * rendiciones ya filtradas a `via = 'encargado'` (ver `calcularPlataEnManos`
 * para el detalle de qué filtra cada parámetro — y de depósitos, que van
 * SIN filtrar: cualquier depósito sale del pozo 'efectivo' sin importar su
 * `medio_pago` destino, igual que en `calcularSaldo`).
 */
export interface MovimientoTenedor {
  tenedor_id: string;
  /** Centavos. Siempre positivo salvo en `ajustes`, que puede ser negativo
   * (mismo criterio que `AjusteCajaMovimiento` de `lib/calculos.ts`). */
  monto_centavos: number;
}

export interface PersonaTenedor {
  id: string;
  nombre: string;
}

/**
 * Una fila de `transferencias_caja` que toca 'efectivo' (origen o
 * destino), tal cual la tabla (0024_transferencias_caja.sql) — sin
 * traducir todavía. `vendedor_id` es quien la cargó (lo completa un
 * trigger, existe desde 0024, no es nuevo de esta migración).
 */
export interface TransferenciaEfectivo {
  vendedor_id: string;
  origen: MedioPago;
  destino: MedioPago;
  /** Centavos, siempre positivo (mismo criterio que
   * `TransferenciaCajaMovimiento` de `lib/calculos.ts`). */
  monto_centavos: number;
}

/**
 * Traduce una `TransferenciaEfectivo` a la contribución con signo que le
 * corresponde a quien la cargó — espejo de `v_plata_en_manos.transferencias_centavos`
 * (0037_plata_en_manos.sql): resta cuando 'efectivo' es el origen (esa
 * plata salió de su mano hacia la Cuenta Ananja real), suma cuando
 * 'efectivo' es el destino (entró a su mano, ej. retirar efectivo real).
 * Devuelve `null` si la transferencia no toca 'efectivo' en absoluto (no
 * le corresponde ninguna atribución de mano — ej. banco -> mercado_pago).
 */
export function contribucionTransferenciaEfectivo(
  t: TransferenciaEfectivo,
): MovimientoTenedor | null {
  if (t.destino === "efectivo") {
    return { tenedor_id: t.vendedor_id, monto_centavos: t.monto_centavos };
  }
  if (t.origen === "efectivo") {
    return { tenedor_id: t.vendedor_id, monto_centavos: -t.monto_centavos };
  }
  return null;
}

/**
 * Una venta de revendedora tal como la lee `v_rendiciones_ananja`
 * (0061_rendiciones_ananja_fifo.sql): `precioCostoCentavos` es lo que le
 * cobró SU encargado por unidad (precio coordinador — sea Ananja a costo o
 * un coordinador con margen) y `costoAnanjaCentavos` el costo REAL de
 * Ananja por unidad, ya resuelto por el caller con la misma cadena que la
 * vista SQL: `entrega_items.costo_lote_unitario_centavos` (la FOTO
 * congelada al momento de la entrega, fuente principal — usar el
 * redondeado VIGENTE del lote rompería el principio de que lo ya vendido
 * no cambia retroactivamente) > `entrega_items.costo_ananja_unitario_centavos`
 * (lo cobrado, sin trazabilidad de costo de lote) > `precioCostoCentavos`
 * (ratio 1, sin entrega en absoluto). Sin clamp: si el costo Ananja superó
 * lo cobrado (venta por debajo de costo), Ananja igual recibe su costo
 * completo — sin caso real hoy, cubierto por un test.
 *
 * El ORDEN del array importa: `calcularParteAnanjaFifo` asume que, dentro
 * de cada `vendedorId`, las ventas vienen en el mismo orden cronológico
 * que usa la vista (`fecha, created_at, id`) — es el caller quien las trae
 * así ordenadas, igual que hoy se ordenan al leerlas de Supabase.
 */
export interface VentaCostoAnanjaRevendedor {
  vendedorId: string;
  cantidad: number;
  precioCostoCentavos: number;
  costoAnanjaCentavos: number;
}

/** Una rendición `via = 'encargado'` cruda, tal cual la tabla `rendiciones`
 * — `vendedorId` es la revendedora que rindió, `tenedorId` quien la
 * recibió (su encargado, o el admin que la cargó si no tiene).
 *
 * El ORDEN del array importa acá también: `calcularParteAnanjaFifo` asume
 * que, dentro de cada `vendedorId`, las rendiciones vienen ordenadas por
 * `created_at` (más vieja primero) — mismo criterio que la vista SQL
 * (`order by created_at, id`, particionado por `vendedor_id`). Un array ya
 * ordenado globalmente por `created_at` (como devuelve Supabase con
 * `.order("created_at")`) cumple esto automáticamente. */
export interface RendicionEncargado {
  tenedorId: string;
  vendedorId: string;
  montoCentavos: number;
}

/**
 * Espejo de `v_rendiciones_ananja` (0061_rendiciones_ananja_fifo.sql): la
 * parte Ananja de CADA rendición `via = 'encargado'`, calculada FIFO en
 * vez de con un ratio promedio (reemplaza a la vieja
 * `aplicarParteAnanjaRendiciones` + `calcularRatioAnanjaPorRevendedor` de
 * 0058, que repartía cada pago proporcional al promedio de TODA la
 * historia de la revendedora — un pago de $900 por una botella de
 * 500 ml de $800 de costo real mostraba $792,25 en vez de $800).
 *
 * Por cada `vendedorId`: las ventas arman franjas de deuda consecutivas
 * (ancho = `precioCostoCentavos × cantidad`, en pesos "precio
 * coordinador"; las de precio $0 no aportan ancho, no hay caso real hoy) y
 * las rendiciones arman franjas de pago consecutivas (ancho =
 * `montoCentavos`) en la MISMA recta. La parte Ananja de un pago es la
 * suma, sobre cada tramo de venta que ese pago cubre, de
 * `pesos_cubiertos × (costoAnanjaCentavos / precioCostoCentavos)` de ESA
 * venta puntual — no un promedio. Si los pagos superan la deuda total
 * vendida, el excedente se atribuye a Ananja 1:1 (ratio 1) — "no pierdas
 * plata", mismo criterio que el fallback que ya usaba 0058 cuando no
 * había nada vendido.
 *
 * Redondeo: cada rendición se redondea individualmente, salvo la ÚLTIMA de
 * cada grupo `(tenedorId, vendedorId)` (por orden de aparición, que ya es
 * cronológico), que absorbe la diferencia contra el redondeo del TOTAL
 * exacto del grupo — así la suma de un grupo nunca se desvía ni un
 * centavo del total real, sin importar cuántas rendiciones lo compongan
 * (misma técnica que 0058, aplicada sobre el número FIFO).
 *
 * Devuelve un `MovimientoTenedor[]` CON LA MISMA CANTIDAD DE FILAS que
 * `rendiciones` (una por rendición, no colapsadas por grupo — así se
 * puede mostrar la parte Ananja de cada movimiento puntual), listo para
 * pasarle a `calcularPlataEnManos` como `rendicionesRecibidas` (que solo
 * suma por `tenedor_id`, así que el número de filas no le importa).
 */
export function calcularParteAnanjaFifo(
  ventas: VentaCostoAnanjaRevendedor[],
  rendiciones: RendicionEncargado[],
): MovimientoTenedor[] {
  interface Franja {
    inicio: number;
    fin: number;
    ananjaCentavos: number;
    pesosCentavos: number;
  }

  // 1) Franjas de deuda por vendedor, en el orden de `ventas` (ya
  //    cronológico — ver el docstring de `VentaCostoAnanjaRevendedor`).
  const franjasPorVendedor = new Map<string, Franja[]>();
  const deudaTotalPorVendedor = new Map<string, number>();
  for (const v of ventas) {
    const pesosCentavos = v.precioCostoCentavos * v.cantidad;
    if (pesosCentavos <= 0) continue;
    const inicio = deudaTotalPorVendedor.get(v.vendedorId) ?? 0;
    const fin = inicio + pesosCentavos;
    const franjas = franjasPorVendedor.get(v.vendedorId) ?? [];
    franjas.push({ inicio, fin, ananjaCentavos: v.costoAnanjaCentavos * v.cantidad, pesosCentavos });
    franjasPorVendedor.set(v.vendedorId, franjas);
    deudaTotalPorVendedor.set(v.vendedorId, fin);
  }

  // 2) Recorrer `rendiciones` en orden (ya cronológico por vendedor — ver
  //    su docstring) acumulando, por vendedor, cuánto se pagó hasta ahora:
  //    la franja de CADA pago es [pagadoPrevio, pagadoPrevio + monto).
  const pagadoPorVendedor = new Map<string, number>();
  interface Parcial {
    tenedorId: string;
    vendedorId: string;
    parteExacta: number;
  }
  const partes: Parcial[] = rendiciones.map((r) => {
    const inicio = pagadoPorVendedor.get(r.vendedorId) ?? 0;
    const fin = inicio + r.montoCentavos;
    pagadoPorVendedor.set(r.vendedorId, fin);

    let parteVentas = 0;
    for (const f of franjasPorVendedor.get(r.vendedorId) ?? []) {
      const solapa = Math.min(fin, f.fin) - Math.max(inicio, f.inicio);
      if (solapa > 0) parteVentas += (solapa * f.ananjaCentavos) / f.pesosCentavos;
    }
    const deudaTotal = deudaTotalPorVendedor.get(r.vendedorId) ?? 0;
    const excedente = Math.max(fin - Math.max(inicio, deudaTotal), 0);

    return { tenedorId: r.tenedorId, vendedorId: r.vendedorId, parteExacta: parteVentas + excedente };
  });

  // 3) Redondeo por grupo (tenedorId, vendedorId) — la última fila del
  //    grupo (por orden de aparición) absorbe el resto.
  interface Grupo {
    indices: number[];
    sumaExacta: number;
  }
  const grupos = new Map<string, Grupo>();
  partes.forEach((p, i) => {
    const clave = `${p.tenedorId} ${p.vendedorId}`;
    const g = grupos.get(clave) ?? { indices: [], sumaExacta: 0 };
    g.indices.push(i);
    g.sumaExacta += p.parteExacta;
    grupos.set(clave, g);
  });

  const montoRedondeadoPorIndice = new Map<number, number>();
  for (const g of grupos.values()) {
    const totalGrupo = Math.round(g.sumaExacta);
    let sumaBruta = 0;
    const brutos = g.indices.map((i) => {
      const bruto = Math.round(partes[i].parteExacta);
      sumaBruta += bruto;
      return bruto;
    });
    g.indices.forEach((i, pos) => {
      const esUltimo = pos === g.indices.length - 1;
      montoRedondeadoPorIndice.set(i, esUltimo ? brutos[pos] + (totalGrupo - sumaBruta) : brutos[pos]);
    });
  }

  return partes.map((p, i) => ({
    tenedor_id: p.tenedorId,
    monto_centavos: montoRedondeadoPorIndice.get(i)!,
  }));
}

export interface PersonaPlataEnManos {
  tenedorId: string;
  nombre: string;
  ventasCobrosCentavos: number;
  rendicionesCentavos: number;
  gastosCentavos: number;
  pagosDeudaCentavos: number;
  ajustesCentavos: number;
  /** Con signo — ver `contribucionTransferenciaEfectivo`. */
  transferenciasCentavos: number;
  depositosCentavos: number;
  /** ventasCobros + rendiciones − gastos − pagosDeuda + ajustes +
   * transferencias − depósitos. La suma de este campo sobre TODAS las
   * personas es, por construcción, igual a `v_saldos_caja` donde
   * `medio_pago = 'efectivo'` — ver 0037_plata_en_manos.sql § cabecera
   * para la demostración completa (incluye `transferencias_caja`, no solo
   * las fuentes nuevas de esta migración: ver la corrección de la revisión
   * adversarial documentada ahí). */
  totalCentavos: number;
}

/**
 * Espejo de `v_plata_en_manos`. Cada parámetro ya debe venir pre-filtrado
 * por el caller exactamente como lo hace la vista SQL:
 *  - `ventasCobros`: comprobantes.cobrado_centavos + cobros.monto_centavos,
 *    ambos con `medio_pago = 'efectivo'`, agrupados por `vendedor_id` (quien
 *    registró la venta/cobro es quien tiene la plata en mano).
 *  - `rendicionesRecibidas`: rendiciones con `via = 'encargado'`, agrupadas
 *    por `tenedor_id` (el encargado, o el admin que la registró si la
 *    revendedora no tiene encargado asignado — ver `registrar_rendicion`).
 *  - `gastos`: gastos con `medio_pago = 'efectivo'`, agrupados por
 *    `vendedor_id` (quien pagó de su propio bolsillo).
 *  - `pagosDeuda`: pagos_deuda con `medio_pago = 'efectivo'` (usa
 *    `monto_caja_centavos`, no `monto_centavos` — mismo criterio que
 *    `calcularSaldo`), agrupados por `vendedor_id`.
 *  - `ajustes`: ajustes_caja con `medio_pago = 'efectivo'`, agrupados por
 *    `vendedor_id` (con signo — un ajuste puede ser negativo).
 *  - `transferencias`: cada `TransferenciaEfectivo` ya traducida con
 *    `contribucionTransferenciaEfectivo` (o filtrada si esa función
 *    devolvió `null` — no tocaba 'efectivo'), agrupadas por `vendedor_id`
 *    (quien cargó la transferencia).
 *  - `depositos`: depositos_cuenta SIN filtrar (todos, cualquiera sea su
 *    `medio_pago` destino — todo depósito sale del pozo 'efectivo'),
 *    agrupados por `tenedor_id`.
 */
export function calcularPlataEnManos(
  tenedores: PersonaTenedor[],
  ventasCobros: MovimientoTenedor[],
  rendicionesRecibidas: MovimientoTenedor[],
  gastos: MovimientoTenedor[],
  pagosDeuda: MovimientoTenedor[],
  ajustes: MovimientoTenedor[],
  transferencias: MovimientoTenedor[],
  depositos: MovimientoTenedor[],
): PersonaPlataEnManos[] {
  const sumaPara = (rows: MovimientoTenedor[], tenedorId: string) =>
    rows
      .filter((r) => r.tenedor_id === tenedorId)
      .reduce((acc, r) => acc + r.monto_centavos, 0);

  return tenedores.map(({ id, nombre }) => {
    const ventasCobrosCentavos = sumaPara(ventasCobros, id);
    const rendicionesCentavos = sumaPara(rendicionesRecibidas, id);
    const gastosCentavos = sumaPara(gastos, id);
    const pagosDeudaCentavos = sumaPara(pagosDeuda, id);
    const ajustesCentavos = sumaPara(ajustes, id);
    const transferenciasCentavos = sumaPara(transferencias, id);
    const depositosCentavos = sumaPara(depositos, id);

    return {
      tenedorId: id,
      nombre,
      ventasCobrosCentavos,
      rendicionesCentavos,
      gastosCentavos,
      pagosDeudaCentavos,
      ajustesCentavos,
      transferenciasCentavos,
      depositosCentavos,
      totalCentavos:
        ventasCobrosCentavos +
        rendicionesCentavos -
        gastosCentavos -
        pagosDeudaCentavos +
        ajustesCentavos +
        transferenciasCentavos -
        depositosCentavos,
    };
  });
}

export interface CuentaAnanja {
  bancoCentavos: number;
  mercadoPagoCentavos: number;
  totalCentavos: number;
}

/**
 * Espejo de `v_cuenta_ananja`: banco + mercado_pago de `v_saldos_caja`
 * (`calcularSaldos`, `lib/calculos.ts`), con el total. `saldos` es lo que
 * devuelve `calcularSaldos` — esta función solo lee las filas `'banco'` y
 * `'mercado_pago'`, igual que la vista SQL lee `v_saldos_caja`.
 */
export function calcularCuentaAnanja(saldos: SaldoPorCaja[]): CuentaAnanja {
  const bancoCentavos =
    saldos.find((s) => s.medio_pago === "banco")?.saldo_centavos ?? 0;
  const mercadoPagoCentavos =
    saldos.find((s) => s.medio_pago === "mercado_pago")?.saldo_centavos ?? 0;

  return {
    bancoCentavos,
    mercadoPagoCentavos,
    totalCentavos: bancoCentavos + mercadoPagoCentavos,
  };
}

export interface DeudaVendedor {
  vendedorId: string;
  nombre: string;
  costoVendidoCentavos: number;
  entregadoCentavos: number;
  /** Positivo: el vendedor le debe a Ananja. Negativo: Ananja le debe a él
   * (rindió/depositó de más) — deja la puerta abierta a pagarle ganancia
   * acumulada más adelante sin cambiar esta función (ver 0037_plata_en_manos.sql
   * § cabecera, "opción futura a mantener posible"). */
  saldoCentavos: number;
}

/**
 * Espejo de `v_deuda_vendedor`. Numéricamente idéntico a
 * `calcularResumenRevendedor` (`costoCentavos`/`rendidoCentavos`/
 * `debeCentavos`) — se reusa esa función en vez de duplicar la suma, esta
 * es solo una fachada con los nombres/forma de la vista nueva. A propósito
 * NO filtra `rendiciones` por `via`: cualquiera sea la vía (entregada al
 * encargado, depositada directo, o pagada por el cliente directo a la
 * cuenta), baja la deuda igual — ver 0037_plata_en_manos.sql § 4.
 */
export function calcularDeudaVendedor(
  vendedorId: string,
  nombre: string,
  ventas: VentaRevendedorMonto[],
  rendiciones: RendicionMonto[],
): DeudaVendedor {
  const resumen = calcularResumenRevendedor(ventas, rendiciones);

  return {
    vendedorId,
    nombre,
    costoVendidoCentavos: resumen.costoCentavos,
    entregadoCentavos: resumen.rendidoCentavos,
    saldoCentavos: resumen.debeCentavos,
  };
}
