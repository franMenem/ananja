/**
 * "Tu ganancia" de una revendedora (o de un admin vendiendo desde su
 * espacio de revendedor): por cada venta, lo que cobró menos lo que le
 * corresponde a Ananja (`precio_costo_centavos`, el costo Ananja de la
 * entrega de donde salió la botella). Total histórico y por mes. Funciones
 * puras, sin Supabase — usadas por `/mi`, `/mi/ganancia` y
 * `/revendedores/[id]`.
 *
 * Una venta SIN precio de venta (la cargó un admin sin saber a cuánto se
 * vendió, ver 0040_revendedores_pagos_precios.sql § 5) queda afuera de
 * vendido/Ananja/ganancia — contarla como $0 mostraría una pérdida que no
 * existe — y se informa aparte en `unidadesSinPrecio`. Lo que le debe a
 * Ananja por esas botellas sí corre (eso se lee de `v_deuda_vendedor`).
 */

export interface VentaGanancia {
  /** "yyyy-mm-dd" */
  fecha: string;
  cantidad: number;
  /** `null` = todavía no se sabe a cuánto se vendió. */
  precioVentaCentavos: number | null;
  precioCostoCentavos: number;
}

export interface TotalesGanancia {
  /** Lo que cobró a sus clientes. */
  vendidoCentavos: number;
  /** Lo que le corresponde a Ananja de esas ventas. */
  ananjaCentavos: number;
  /** Lo que le quedó a ella (puede ser negativo si vendió bajo costo). */
  gananciaCentavos: number;
}

export interface FilaGananciaMes extends TotalesGanancia {
  /** "yyyy-mm" */
  periodo: string;
}

export interface ResumenGanancia extends TotalesGanancia {
  /** Solo meses con ventas con precio, del más reciente al más viejo. */
  porMes: FilaGananciaMes[];
  /** Botellas vendidas sin precio de venta cargado (no cuentan arriba). */
  unidadesSinPrecio: number;
}

export function calcularGananciaRevendedor(ventas: VentaGanancia[]): ResumenGanancia {
  const porPeriodo = new Map<string, TotalesGanancia>();
  const total: TotalesGanancia = { vendidoCentavos: 0, ananjaCentavos: 0, gananciaCentavos: 0 };
  let unidadesSinPrecio = 0;

  for (const v of ventas) {
    if (v.precioVentaCentavos === null) {
      unidadesSinPrecio += v.cantidad;
      continue;
    }
    const vendido = v.cantidad * v.precioVentaCentavos;
    const ananja = v.cantidad * v.precioCostoCentavos;
    const periodo = v.fecha.slice(0, 7);
    const fila = porPeriodo.get(periodo) ?? {
      vendidoCentavos: 0,
      ananjaCentavos: 0,
      gananciaCentavos: 0,
    };
    fila.vendidoCentavos += vendido;
    fila.ananjaCentavos += ananja;
    fila.gananciaCentavos += vendido - ananja;
    porPeriodo.set(periodo, fila);

    total.vendidoCentavos += vendido;
    total.ananjaCentavos += ananja;
    total.gananciaCentavos += vendido - ananja;
  }

  const porMes = Array.from(porPeriodo.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([periodo, t]) => ({ periodo, ...t }));

  return { ...total, porMes, unidadesSinPrecio };
}

export interface SerieGananciaAnio {
  anio: number;
  /** 12 valores, enero (0) a diciembre (11), en centavos. */
  valores: number[];
}

/**
 * Ganancia por mes agrupada por año (más reciente primero), con la forma
 * que espera `GraficoLineas`. Un mes con ganancia negativa se dibuja en 0
 * (el gráfico no tiene eje negativo); el número real sigue en la lista por
 * mes de la misma pantalla.
 */
export function seriesGananciaPorAnio(porMes: FilaGananciaMes[]): SerieGananciaAnio[] {
  const porAnio = new Map<number, number[]>();
  for (const fila of porMes) {
    const [anioTexto, mesTexto] = fila.periodo.split("-");
    const anio = Number(anioTexto);
    const mes = Number(mesTexto) - 1;
    if (!Number.isInteger(anio) || mes < 0 || mes > 11) continue;
    const valores = porAnio.get(anio) ?? Array.from({ length: 12 }, () => 0);
    valores[mes] += Math.max(fila.gananciaCentavos, 0);
    porAnio.set(anio, valores);
  }
  return Array.from(porAnio.entries())
    .sort(([a], [b]) => b - a)
    .map(([anio, valores]) => ({ anio, valores }));
}
