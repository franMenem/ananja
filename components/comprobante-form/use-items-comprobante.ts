"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FilaLote } from "@/lib/dominio/lotes-split";
import { agruparFilasPorProducto } from "@/lib/dominio/lotes-split";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import {
  calcularTotalPreciosComprobante,
  construirItemsPayloadComprobante,
  construirResumenDescuentoComprobante,
  buscarProductoConLotesDescuadrados,
  sincronizarPreciosSugeridosComprobante,
  type ItemComprobantePayload,
} from "@/lib/dominio/comprobantes";
import { formatMontoDisplay } from "@/lib/money";
import type { Tables } from "@/lib/types";

import type { ComprobanteFormInitial } from "@/components/comprobante-form/tipos";

type Producto = Tables<"productos">;

export type UseItemsComprobanteResult = {
  cantidades: Record<string, number>;
  setCantidad: (productoId: string, value: number) => void;
  lotesIniciales: Record<string, FilaLote[]>;
  lotesPorProducto: Record<string, FilaLote[]>;
  handleLotesChange: (productoId: string, filas: FilaLote[]) => void;
  precios: Record<string, string>;
  handlePrecioInputChange: (productoId: string, value: string) => void;
  totalPreciosCentavos: number | null;
  itemsPayload: ItemComprobantePayload[];
  productoConLotesDescuadrados: () => Producto | null;
  resumenDescuento: string;
};

/**
 * Cantidades, split por lote y "precio por botella" de cada producto —
 * junto con el payload de ítems que se manda a
 * `crear_comprobante`/`actualizar_comprobante` y las validaciones que
 * dependen de ellos. Extraído de `components/comprobante-form.tsx`; los
 * cálculos puros viven en `lib/dominio/comprobantes.ts` (testeados ahí).
 */
export function useItemsComprobante(
  initial: ComprobanteFormInitial | undefined,
  productos: Producto[],
  lotesConStock: LoteConStockDeProducto[],
): UseItemsComprobanteResult {
  // `initial.items` puede traer varias filas del mismo producto (una por
  // lote, ver ComprobanteFormInitial) — acá se suman para el stepper total
  // de cada producto; el split por lote de cada uno vive aparte, en
  // `lotesIniciales`/`lotesPorProducto` más abajo.
  const [cantidades, setCantidades] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const item of initial?.items ?? []) {
      map[item.productoId] = (map[item.productoId] ?? 0) + item.cantidad;
    }
    return map;
  });

  function setCantidad(productoId: string, value: number) {
    setCantidades((prev) => ({ ...prev, [productoId]: value }));
  }

  // Split por lote ya guardado (editar), agrupado por producto — usado solo
  // para precargar cada `SelectorLote` la primera vez que se monta.
  const [lotesIniciales] = useState(() =>
    agruparFilasPorProducto(initial?.items ?? []),
  );
  // Split por lote vigente de cada producto, alimentado por los `onChange`
  // de cada `SelectorLote` — se arma el payload de la RPC a partir de acá.
  const [lotesPorProducto, setLotesPorProducto] = useState<
    Record<string, FilaLote[]>
  >({});

  function handleLotesChange(productoId: string, filas: FilaLote[]) {
    setLotesPorProducto((prev) => ({ ...prev, [productoId]: filas }));
  }

  // --- Precio por botella (build "margen de ventas", 0031) ---------------
  // Un solo campo por producto (no por lote): al guardar, ese mismo precio
  // se manda en CADA fila de `p_items` de ese producto, tenga uno o varios
  // lotes. `preciosTocadosRef` funciona igual que `montoTocadoRef`: mientras
  // el dueño no haya escrito nada a mano, el campo se sigue recalculando
  // solo con el precio minorista sugerido del PRIMER lote elegido para ese
  // producto — con la excepción de que un precio YA GUARDADO (editar) cuenta
  // como "tocado" desde el arranque, así nunca se pisa en silencio un
  // descuento real por la sugerencia del lote.
  const [precios, setPrecios] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const item of initial?.items ?? []) {
      if (item.precioUnitarioCentavos == null) continue;
      if (map[item.productoId] !== undefined) continue;
      map[item.productoId] = formatMontoDisplay(item.precioUnitarioCentavos);
    }
    return map;
  });
  const preciosTocadosRef = useRef<Record<string, boolean>>(
    (() => {
      const map: Record<string, boolean> = {};
      for (const item of initial?.items ?? []) {
        if (item.precioUnitarioCentavos != null) map[item.productoId] = true;
      }
      return map;
    })(),
  );

  function handlePrecioInputChange(productoId: string, value: string) {
    preciosTocadosRef.current[productoId] = true;
    setPrecios((prev) => ({ ...prev, [productoId]: value }));
  }

  // Total en vivo de "cantidad × precio por botella" de los ítems con precio
  // cargado — `null` si ninguno tiene precio todavía (no hay nada que
  // mostrar ni comparar contra el monto de la venta).
  const totalPreciosCentavos = useMemo(
    () => calcularTotalPreciosComprobante(productos, cantidades, precios),
    [productos, cantidades, precios],
  );

  // `${loteId}:${productoId} -> precio_minorista_sugerido_centavos` de
  // `v_costo_lote_desglose` (lib/lotes-disponibles.ts) — insumo de la
  // precarga de "Precio por botella" de abajo.
  const precioSugeridoPorLoteProducto = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lotesConStock) {
      if (l.precioMinoristaSugeridoCentavos != null) {
        map.set(`${l.loteId}:${l.productoId}`, l.precioMinoristaSugeridoCentavos);
      }
    }
    return map;
  }, [lotesConStock]);

  // Mientras el dueño no haya tocado el precio de un producto a mano
  // (`preciosTocadosRef`), lo mantiene sincronizado con el precio minorista
  // sugerido del PRIMER lote elegido para ese producto (recalcula solo si
  // no está "tocado").
  useEffect(() => {
    setPrecios((prev) =>
      sincronizarPreciosSugeridosComprobante(
        prev,
        productos,
        cantidades,
        lotesPorProducto,
        preciosTocadosRef.current,
        precioSugeridoPorLoteProducto,
      ),
    );
  }, [productos, cantidades, lotesPorProducto, precioSugeridoPorLoteProducto]);

  // Ítems para `crear_comprobante`/`actualizar_comprobante`: cuando el
  // producto tiene un split por lote cargado (`SelectorLote` ya avisó via
  // `handleLotesChange`), manda una fila por lote — `fusionarFilasDuplicadas`
  // por las dudas, la RPC rechaza dos filas con el mismo
  // `(producto_id, lote_id)` (ITEM_DUPLICADO). Sin split todavía (recién
  // montado, o producto sin ningún lote cargado), manda una sola fila sin
  // `lote_id`, igual que antes de esta migración.
  const itemsPayload = useMemo(
    () => construirItemsPayloadComprobante(productos, cantidades, lotesPorProducto, precios),
    [productos, cantidades, lotesPorProducto, precios],
  );

  // Split por lote descuadrado (el dueño movió cantidades entre lotes y el
  // total ya no da igual al del producto) — bloquea el guardado con el
  // mismo criterio que cualquier otro campo inválido del formulario, en vez
  // de mandar un ítem que la RPC va a aceptar con una cantidad que no es la
  // que el dueño quiso vender/entregar.
  function productoConLotesDescuadrados(): Producto | null {
    return buscarProductoConLotesDescuadrados(productos, cantidades, lotesPorProducto);
  }

  // Resumen de lo que se va a descontar del depósito (design/handoff README § /comprobantes/
  // nuevo — texto de ayuda bajo el botón de guardar), ordenado de mayor a
  // menor presentación para que coincida con el resto de los resúmenes.
  const resumenDescuento = useMemo(
    () => construirResumenDescuentoComprobante(productos, cantidades),
    [productos, cantidades],
  );

  return {
    cantidades,
    setCantidad,
    lotesIniciales,
    lotesPorProducto,
    handleLotesChange,
    precios,
    handlePrecioInputChange,
    totalPreciosCentavos,
    itemsPayload,
    productoConLotesDescuadrados,
    resumenDescuento,
  };
}
