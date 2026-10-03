import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import type { Enums } from "@/lib/types";

export type MedioPago = Enums<"medio_pago">;

export type LineaEditable = {
  key: number;
  insumoId: string;
  cantidad: string;
  precio: string;
};

/** Una línea ya parseada y válida, lista para calcular y mandar. */
export type LineaValida = {
  insumoId: string;
  cantidad: number;
  precioUnitarioCentavos: number;
};

export const ERRORES: Record<string, string> = {
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
  NO_AUTORIZADO: "Solo un administrador puede cargar compras.",
  INSUMO_INVALIDO: "Uno de los insumos ya no existe o está desactivado.",
  INSUMO_REPETIDO: "Hay un insumo repetido en dos líneas. Juntalas en una sola.",
  CANTIDAD_INVALIDA: "Revisá las cantidades.",
  PRECIO_INVALIDO: "Revisá los precios unitarios.",
  IVA_INVALIDO: "Revisá el porcentaje de IVA.",
  ENVIO_INVALIDO: "Revisá el monto del envío.",
  CATEGORIA_INSUMOS_FALTANTE: "Falta la categoría Insumos.",
  TOTAL_NO_COINCIDE:
    "El total que calculó la app no coincide con el de la pantalla. Recargá la página y probá de nuevo: no se guardó nada.",
};

export function mensajeErrorFactura(codigo: string | undefined): string {
  return traducirErrorRpc(codigo, ERRORES, "No se pudo guardar la factura. Probá de nuevo: no se guardó nada.");
}

export const inputClass =
  "mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary";
export const labelClass = "text-[10px] tracking-[0.18em] text-text-muted uppercase";
