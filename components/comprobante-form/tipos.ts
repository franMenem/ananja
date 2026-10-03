import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

/**
 * Estado inicial de `ComprobanteForm` en modo "editar" — re-exportado desde
 * `components/comprobante-form.tsx` (ver ahí el resto del contrato). Vive
 * en su propio archivo para que los hooks de `components/comprobante-form/*`
 * puedan importarlo sin depender del componente raíz (evita un ciclo de
 * imports entre el orquestador y sus hooks).
 */
export type ComprobanteFormInitial = {
  imagenPath: string | null;
  montoCentavos: number;
  cobradoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  nota: string | null;
  /** Ojo: puede haber VARIAS filas para el mismo `productoId` cuando salen
   * de lotes distintos (`comprobante_items.lote_id`, ver
   * supabase/migrations/0028_costos_por_lote.sql) — no colapsar por
   * producto antes de pasarlas acá, `ComprobanteForm` ya suma cantidades y
   * arma el split por lote a partir de la lista completa. `loteId: null` =
   * ítem legado sin lote asignado. */
  items: {
    productoId: string;
    cantidad: number;
    loteId: string | null;
    /** `comprobante_items.precio_unitario_centavos` ya guardado — `null` en
     * ítems legado o cuando no se cargó (supabase/migrations/0031_margen_ventas.sql).
     * Con varias filas del mismo producto (varios lotes), se usa la del
     * PRIMER ítem con precio cargado para precargar el campo único "Precio
     * por botella" de esa presentación. */
    precioUnitarioCentavos?: number | null;
  }[];
  clienteId?: string | null;
};
