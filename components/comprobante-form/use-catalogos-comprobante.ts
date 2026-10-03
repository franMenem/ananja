"use client";

import { useEffect, useState } from "react";

import { cargarCatalogosComprobante } from "@/lib/data/comprobantes";
import { ajustarQuedanParaEdicion, type LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

type Producto = Tables<"productos">;

export type UseCatalogosComprobanteResult = {
  productos: Producto[];
  productosLoading: boolean;
  lotesConStock: LoteConStockDeProducto[];
};

/**
 * Catálogos independientes que necesita `ComprobanteForm` al montar
 * (productos + lotes con stock) — una sola tanda
 * (`cargarCatalogosComprobante`, lib/data/comprobantes.ts) en vez de dos
 * `useEffect` sueltos con su propio `createClient()` cada uno. Extraído de
 * `components/comprobante-form.tsx`.
 */
export function useCatalogosComprobante(
  mode: "crear" | "editar",
  itemsIniciales: { productoId: string; loteId: string | null; cantidad: number }[],
): UseCatalogosComprobanteResult {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productosLoading, setProductosLoading] = useState(true);
  const [lotesConStock, setLotesConStock] = useState<LoteConStockDeProducto[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { productos: data, lotesConStock: lotes } =
        await cargarCatalogosComprobante(supabase);
      if (cancelled) return;

      setProductos(data);
      setProductosLoading(false);

      // Al editar, `v_stock_por_lote` todavía cuenta las filas ACTUALES de
      // este comprobante como vendidas (recién se borran al guardar) — se
      // le suma de vuelta a cada lote lo que este comprobante ya tenía
      // asignado, si no el selector puede subestimar lo disponible y
      // bloquear el guardado en falso (ver `ajustarQuedanParaEdicion`,
      // lib/lotes-disponibles.ts).
      setLotesConStock(
        mode === "editar"
          ? ajustarQuedanParaEdicion(lotes, itemsIniciales)
          : lotes,
      );
    }

    load();
    return () => {
      cancelled = true;
    };
    // Solo al montar: `mode`/`itemsIniciales` no cambian durante la vida de
    // la pantalla (props de la página, no estado editable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { productos, productosLoading, lotesConStock };
}
