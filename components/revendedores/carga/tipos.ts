import type { MedioPago } from "@/lib/dominio/carga-revendedor";

/** Estado en pantalla de una fila de la sección Entrega (una presentación). */
export type FilaEntregaEstado = {
  cantidad: number;
  loteId: string | null;
  /** El admin eligió el lote a mano: ya no se re-elige al cambiar la fecha. */
  loteManual: boolean;
  costo: string;
  sugerido: string;
};

export type PagoPendienteCarga = {
  id: string;
  montoCentavos: number;
  fecha: string;
  medioPago: MedioPago;
};

/** Estado en pantalla de una línea de venta (puede haber varias por producto). */
export type LineaVentaEstado = {
  id: string;
  cantidad: number;
  precio: string;
  sinPrecio: boolean;
  /** Lote elegido a mano, o `null` = "Automático (FIFO)" (0062). */
  loteId: string | null;
};
