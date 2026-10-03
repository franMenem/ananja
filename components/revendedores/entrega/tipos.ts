export type StockAlert = {
  producto: string;
  disponible: number;
};

export type ItemEntrega = {
  producto_id: string;
  cantidad: number;
  lote_id?: string;
  costo_ananja_unitario_centavos?: number;
  precio_sugerido_centavos?: number;
};

/** Una fila del paso "Revisá la entrega": un producto de un lote puntual,
 * con los dos precios editables como texto (se parsean al confirmar). */
export type FilaRevision = {
  clave: string;
  productoId: string;
  loteId: string | null;
  cantidad: number;
  costo: string;
  sugerido: string;
  /** Costo Ananja del lote (lo que es de Ananja por botella), `null` si el
   * lote no tiene costos o no hay lote. */
  costoLote: number | null;
  /** El lote no tiene costos cargados: el costo arranca vacío y es obligatorio. */
  sinCostosDelLote: boolean;
};
