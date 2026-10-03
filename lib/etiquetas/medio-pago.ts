/**
 * Etiqueta visible de cada medio de pago (`banco`/`mercado_pago`/`efectivo`)
 * — fuente ÚNICA para toda la app. Antes el mismo `Record` estaba copiado en
 * `app/(app)/gastos/page.tsx`, `app/(app)/gastos/[id]/page.tsx`,
 * `app/(app)/comprobantes/page.tsx`, `app/(app)/comprobantes/[id]/page.tsx`,
 * `app/(app)/clientes/[id]/page.tsx`, `components/comprobantes-list.tsx` y
 * `components/medio-pago-chips.tsx` (el selector). `lib/caja.ts` reexporta
 * `MEDIO_PAGO_LABELS` desde acá para no tocar los ~20 lugares que ya lo
 * importaban de ahí.
 */

import type { Enums } from "@/lib/types";

export type MedioPago = Enums<"medio_pago">;

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  banco: "Banco",
  mercado_pago: "Mercado Pago",
  efectivo: "Efectivo",
};

/**
 * Etiqueta de un medio de pago, con fallback seguro: `"—"` si `valor` es
 * `null`/`undefined` (campo opcional sin cargar) o no es uno de los tres
 * medios válidos (dato corrupto).
 */
export function etiquetaMedioPago(valor: string | null | undefined): string {
  if (valor && valor in ETIQUETA_MEDIO_PAGO) return ETIQUETA_MEDIO_PAGO[valor as MedioPago];
  return "—";
}
