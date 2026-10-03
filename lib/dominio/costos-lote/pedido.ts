/**
 * Arma el pedido completo al proveedor — costo por presentación y lo que se le
 * paga por concepto — juntando aceite + etiquetas + envase + transporte +
 * otros con las mismas reglas y el mismo orden que `aplicar_costos_lote`
 * (0038) + `v_costo_lote_desglose`. Es el orquestador: importa de todos
 * los demás submódulos de `costos-lote/`, ninguno de ellos importa de acá
 * (evita ciclos).
 */

import { litrosAceitePorItem } from "@/lib/dominio/costos-lote/aceite";
import {
  calcularEnvasePedido,
  type EnvaseConcepto,
} from "@/lib/dominio/costos-lote/envasado";
import {
  calcularCostoUnitarioEtiqueta,
  type PreviewEtiquetaInput,
  type RecetaEtiquetaConInsumo,
} from "@/lib/dominio/costos-lote/etiquetas";
import {
  calcularTransportePct,
  reescalarTransporte,
  type LineaTransportePedido,
  type TransporteConcepto,
} from "@/lib/dominio/costos-lote/transporte";
import {
  calcularDesgloseLote,
  calcularPreciosSugeridos,
  type CostoCompartidoInput,
  type CostoDirectoInput,
  type ItemPesoInput,
  type PorcentajesLote,
  type PreciosSugeridos,
} from "@/lib/dominio/costos-lote/tipos";

/** Elección de transporte del formulario — mutuamente excluyente, mismo
 * criterio que `p_costos.transporte_pct`/`transporte_centavos`
 * (`aplicar_costos_lote`, `supabase/migrations/0029_costos_reales_lote.sql`). */
export type PreviewTransporteInput =
  | { modo: "porcentaje"; porcentajeSobreAceiteMasEnvase: number }
  | { modo: "fijo"; totalCentavos: number };

export interface ConstruirPreviewCostosLoteInput {
  items: ItemPesoInput[];
  /** Recetas de TODOS los insumos tipo 'etiqueta' usados por `items` (una
   * fila por (producto, insumo) — normalmente 2 por presentación: frente y
   * retro). */
  recetasEtiqueta: RecetaEtiquetaConInsumo[];
  /** `null`: ese concepto no se cargó todavía, no se arma línea de aceite
   * (el caller ya resolvió el fallback del tanque antes de llegar acá). */
  precioLitroAceiteCentavos: number | null;
  /** Solo los insumos de etiqueta con precio CARGADO en pantalla. */
  etiquetas: PreviewEtiquetaInput[];
  /** Precio de envase cargado por presentación — `productoId` ausente = sin
   * cargar todavía. */
  envasePorProducto: Map<string, number>;
  /** 0053: precio para EL COSTO por presentación, si es distinto del
   * pagado — `productoId` ausente = usa `envasePorProducto` (mismo precio
   * para pago y costo). */
  envaseCostoPorProducto?: Map<string, number>;
  transporte: PreviewTransporteInput;
  otrosCentavos: number;
  ivaPct: number;
  incluyeIva: boolean;
  pcts: PorcentajesLote;
}

export interface PreviewCostosLoteItem {
  productoId: string;
  presentacionMl: number;
  aceiteCentavos: number;
  etiquetaCentavos: number;
  envaseCentavos: number;
  transporteCentavos: number;
  otrosCentavos: number;
  totalCentavos: number;
  costoUnitarioCentavos: number;
  precios: PreciosSugeridos;
}

/** Montos reales (redondeos) que se aplican al calcular el pedido. */
export interface RedondeosPedido {
  /** Por `productoId`: monto real del envasado de esa presentación. */
  envase: Record<string, number>;
  /** Monto real del transporte % (todo el pedido), o `null`. */
  transporteCentavos: number | null;
}

export interface CalcularPedidoInput extends ConstruirPreviewCostosLoteInput {
  /** Ver `CalcularEnvasePedidoInput.cobradoSinIva`. */
  envaseCobradoSinIva: boolean | null;
  redondeos?: RedondeosPedido | null;
  /** Costo Ananja REDONDEADO por presentación (0054), clave = `producto_id`
   * — ausente/sin entrada para una presentación = usa el calculado
   * (`calcularPreciosSugeridos`). */
  costoAnanjaRedondeadoPorProducto?: Map<string, number>;
}

export interface PedidoCalculado {
  /** Costo por presentación (con los redondeos aplicados). */
  presentaciones: PreviewCostosLoteItem[];
  /** Costo del aceite de todo el pedido — ya comprado, no se paga acá. */
  aceiteCentavos: number;
  /** Costo por insumo de etiqueta (todas las presentaciones) — ya
   * compradas, no se pagan acá. Mismo orden que `input.etiquetas`. */
  etiquetas: { insumoId: string; costoCentavos: number }[];
  /** Solo las presentaciones con precio de envasado cargado. */
  envases: EnvaseConcepto[];
  transporte: TransporteConcepto | null;
  /** Otros del pedido (a pagar = costo). 0 si no hay. */
  otrosCentavos: number;
  totalAPagarCentavos: number;
}

/**
 * Arma el pedido completo — costo por presentación Y lo que se le paga al
 * proveedor por concepto — con las mismas reglas y el mismo orden que
 * `aplicar_costos_lote` (0038) + `v_costo_lote_desglose`: aceite y etiquetas
 * directos, envase (`calcularEnvasePedido`, con su redondeo), transporte %
 * por presentación sobre (aceite + envase + etiquetas, costo) re-escalado si hay
 * redondeo (`reescalarTransporte`) o fijo repartido por volumen, y otros
 * repartidos por volumen. Lo usan la vista previa en vivo de
 * `CostosLoteCampos` y el paso "Revisá el pedido".
 */
export function calcularPedido(input: CalcularPedidoInput): PedidoCalculado {
  const {
    items,
    recetasEtiqueta,
    precioLitroAceiteCentavos,
    etiquetas,
    envasePorProducto,
    envaseCostoPorProducto,
    transporte,
    otrosCentavos,
    ivaPct,
    incluyeIva,
    pcts,
    envaseCobradoSinIva,
  } = input;
  const redondeos = input.redondeos ?? null;
  const costoAnanjaRedondeadoPorProducto = input.costoAnanjaRedondeadoPorProducto ?? null;

  const aceitePorItem = new Map<string, number>();
  for (const item of items) {
    const litros = litrosAceitePorItem(item);
    aceitePorItem.set(
      item.productoId,
      precioLitroAceiteCentavos == null ? 0 : Math.round(litros * precioLitroAceiteCentavos),
    );
  }

  const etiquetaPorItem = new Map<string, number>();
  const etiquetaPorInsumo = new Map<string, number>();
  for (const item of items) {
    let total = 0;
    for (const etiqueta of etiquetas) {
      const receta = recetasEtiqueta.find(
        (r) => r.productoId === item.productoId && r.insumoId === etiqueta.insumoId,
      );
      if (!receta) continue;
      const costoUnitario = calcularCostoUnitarioEtiqueta(etiqueta, ivaPct, incluyeIva);
      const monto = Math.round(costoUnitario * receta.cantidad * item.cantidad);
      total += monto;
      etiquetaPorInsumo.set(etiqueta.insumoId, (etiquetaPorInsumo.get(etiqueta.insumoId) ?? 0) + monto);
    }
    etiquetaPorItem.set(item.productoId, total);
  }

  const envases: EnvaseConcepto[] = [];
  const envasePorItem = new Map<string, number>();
  for (const item of items) {
    const precio = envasePorProducto.get(item.productoId);
    if (precio == null) {
      envasePorItem.set(item.productoId, 0);
      continue;
    }
    const envase = calcularEnvasePedido({
      precioUnitarioCentavos: precio,
      cantidad: item.cantidad,
      ivaPct,
      incluyeIva,
      cobradoSinIva: envaseCobradoSinIva,
      redondeoCentavos: redondeos?.envase[item.productoId] ?? null,
      precioCostoUnitarioCentavos: envaseCostoPorProducto?.get(item.productoId) ?? null,
    });
    envases.push({
      ...envase,
      productoId: item.productoId,
      presentacionMl: item.presentacionMl,
      cantidad: item.cantidad,
    });
    envasePorItem.set(item.productoId, envase.totalCentavos);
  }

  const costosDirectos: CostoDirectoInput[] = items.flatMap((item) => [
    { productoId: item.productoId, concepto: "aceite" as const, totalCentavos: aceitePorItem.get(item.productoId) ?? 0 },
    { productoId: item.productoId, concepto: "etiqueta" as const, totalCentavos: etiquetaPorItem.get(item.productoId) ?? 0 },
    { productoId: item.productoId, concepto: "envase" as const, totalCentavos: envasePorItem.get(item.productoId) ?? 0 },
  ]);

  // El transporte fijo se reparte por volumen igual que "otro"; el % es una
  // línea DIRECTA por presentación y se suma aparte más abajo.
  const costosCompartidos: CostoCompartidoInput[] = [{ concepto: "otro", totalCentavos: otrosCentavos }];
  if (transporte.modo === "fijo") {
    costosCompartidos.push({ concepto: "transporte", totalCentavos: transporte.totalCentavos });
  }

  const desglose = calcularDesgloseLote(items, costosDirectos, costosCompartidos);

  let transporteConcepto: TransporteConcepto | null = null;
  const transportePorItem = new Map<string, number>();
  if (transporte.modo === "porcentaje") {
    const pct = transporte.porcentajeSobreAceiteMasEnvase;
    if (pct > 0) {
      // Igual que el RPC: solo presentaciones con base > 0 tienen línea.
      const lineasBase: LineaTransportePedido[] = items.flatMap((item) => {
        const base =
          (aceitePorItem.get(item.productoId) ?? 0) +
          (etiquetaPorItem.get(item.productoId) ?? 0) +
          (envasePorItem.get(item.productoId) ?? 0);
        return base > 0 ? [{ productoId: item.productoId, totalCentavos: calcularTransportePct(base, pct) }] : [];
      });
      if (lineasBase.length > 0) {
        const calculadoCentavos = lineasBase.reduce((acc, l) => acc + l.totalCentavos, 0);
        const redondeo = redondeos?.transporteCentavos ?? null;
        const lineas =
          redondeo !== null && calculadoCentavos > 0 ? reescalarTransporte(lineasBase, redondeo) : lineasBase;
        for (const linea of lineas) transportePorItem.set(linea.productoId, linea.totalCentavos);
        transporteConcepto = {
          modo: "porcentaje",
          pct,
          calculadoCentavos,
          aPagarCentavos: lineas.reduce((acc, l) => acc + l.totalCentavos, 0),
          lineas,
        };
      }
    }
  } else if (transporte.totalCentavos > 0) {
    transporteConcepto = {
      modo: "fijo",
      calculadoCentavos: transporte.totalCentavos,
      aPagarCentavos: transporte.totalCentavos,
    };
  }

  const presentaciones = items.map((item) => {
    const d = desglose.find((x) => x.productoId === item.productoId)!;
    const transporteCentavos =
      transporte.modo === "porcentaje" ? (transportePorItem.get(item.productoId) ?? 0) : d.transporteCentavos;
    const totalCentavos =
      d.aceiteCentavos + d.etiquetaCentavos + d.envaseCentavos + transporteCentavos + d.otrosCentavos;
    const costoUnitarioCentavos = totalCentavos === 0 ? 0 : Math.round(totalCentavos / item.cantidad);
    return {
      productoId: item.productoId,
      presentacionMl: item.presentacionMl,
      aceiteCentavos: d.aceiteCentavos,
      etiquetaCentavos: d.etiquetaCentavos,
      envaseCentavos: d.envaseCentavos,
      transporteCentavos,
      otrosCentavos: d.otrosCentavos,
      totalCentavos,
      costoUnitarioCentavos,
      precios: calcularPreciosSugeridos(
        costoUnitarioCentavos,
        pcts,
        costoAnanjaRedondeadoPorProducto?.get(item.productoId) ?? null,
      ),
    };
  });

  const otrosPagables = otrosCentavos > 0 ? otrosCentavos : 0;
  const totalAPagarCentavos =
    envases.reduce((acc, e) => acc + e.aPagarCentavos, 0) +
    (transporteConcepto?.aPagarCentavos ?? 0) +
    otrosPagables;

  return {
    presentaciones,
    aceiteCentavos: Array.from(aceitePorItem.values()).reduce((acc, v) => acc + v, 0),
    etiquetas: etiquetas
      .filter((e) => etiquetaPorInsumo.has(e.insumoId))
      .map((e) => ({ insumoId: e.insumoId, costoCentavos: etiquetaPorInsumo.get(e.insumoId) ?? 0 })),
    envases,
    transporte: transporteConcepto,
    otrosCentavos: otrosPagables,
    totalAPagarCentavos,
  };
}

/**
 * Vista previa por presentación con las reglas ANTERIORES a 0038 (IVA del
 * envase gobernado por `incluyeIva`, sin redondeos) — delega en
 * `calcularPedido` en modo viejo. Se conserva para los tests de la planilla.
 */
export function construirPreviewCostosLote(
  input: ConstruirPreviewCostosLoteInput,
): PreviewCostosLoteItem[] {
  return calcularPedido({ ...input, envaseCobradoSinIva: null }).presentaciones;
}
