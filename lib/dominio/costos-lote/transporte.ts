/**
 * Costo de transporte: % sobre (aceite + envase + etiquetas, a costo) de
 * cada presentación, re-escalado si el proveedor cobró un "monto real" distinto
 * del calculado (0038/0039).
 */

import { formatCentavos } from "@/lib/money";

// ============================================================
// Transporte % — 0029: además del monto fijo repartido por volumen
// (`tipos.ts` § `calcularDesgloseLote`/`repartirCompartido`), se admite un
// % sobre (aceite + envase + etiquetas, a costo) de CADA presentación —
// directo, no compartido.
// ============================================================

/** Espejo de la rama `transporte_pct` de `aplicar_costos_lote`: % sobre
 * (aceite + envase + etiquetas, a costo) de UNA presentación. `0` si la base es `0`
 * (sin aceite ni envase cargados todavía, no hay sobre qué calcular). */
export function calcularTransportePct(
  aceiteMasEnvaseCentavos: number,
  transportePct: number,
): number {
  if (aceiteMasEnvaseCentavos <= 0) return 0;
  return Math.round((aceiteMasEnvaseCentavos * transportePct) / 100);
}

export interface LineaTransportePedido {
  productoId: string;
  totalCentavos: number;
}

/**
 * Espejo del re-escalado del transporte % de `aplicar_costos_lote` (0038):
 * cada línea pasa a `floor(línea × monto / suma)` y los centavos que sobran
 * van TODOS a la línea más grande según los montos ORIGINALES (desempate:
 * `productoId` menor, igual que `order by total_centavos desc, producto_id`).
 * Con BigInt para que `línea × monto` no pierda precisión con montos grandes.
 * Suma 0 o sin líneas: se devuelven tal cual (el RPC lo rechaza con
 * `REDONDEO_INVALIDO`, la UI nunca lo manda).
 */
export function reescalarTransporte(
  lineas: LineaTransportePedido[],
  montoCentavos: number,
): LineaTransportePedido[] {
  const suma = lineas.reduce((acc, l) => acc + l.totalCentavos, 0);
  if (lineas.length === 0 || suma <= 0) return lineas.map((l) => ({ ...l }));

  let mayor = lineas[0];
  for (const linea of lineas) {
    if (
      linea.totalCentavos > mayor.totalCentavos ||
      (linea.totalCentavos === mayor.totalCentavos && linea.productoId < mayor.productoId)
    ) {
      mayor = linea;
    }
  }

  const monto = BigInt(Math.round(montoCentavos));
  const sumaBig = BigInt(Math.round(suma));
  const escaladas = lineas.map((l) => ({
    productoId: l.productoId,
    totalCentavos: Number((BigInt(Math.round(l.totalCentavos)) * monto) / sumaBig),
  }));
  const resto = Number(monto) - escaladas.reduce((acc, l) => acc + l.totalCentavos, 0);
  return escaladas.map((l) =>
    l.productoId === mayor.productoId ? { ...l, totalCentavos: l.totalCentavos + resto } : l,
  );
}

export type TransporteConcepto =
  | {
      modo: "porcentaje";
      pct: number;
      /** Σ de las líneas por presentación ANTES del redondeo. */
      calculadoCentavos: number;
      aPagarCentavos: number;
      lineas: LineaTransportePedido[];
    }
  | { modo: "fijo"; calculadoCentavos: number; aPagarCentavos: number };

/**
 * Nota del renglón "Transporte X%": sobre qué base se calcula (mismo texto
 * que `construirLineasCostoBotellaDetallada`, `cobranza.ts`) y, si hay un
 * "Monto real" cargado, calculado vs. cobrado.
 */
export function notaTransportePctPedido(transporte: {
  pct: number;
  calculadoCentavos: number;
  aPagarCentavos: number;
}): string {
  const base = `${transporte.pct}% sobre aceite + envasado + etiquetas`;
  if (transporte.aPagarCentavos === transporte.calculadoCentavos) return base;
  return `${base} = ${formatCentavos(transporte.calculadoCentavos)} · cobrado ${formatCentavos(transporte.aPagarCentavos)}`;
}
