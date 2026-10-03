import { formatMontoDisplay } from "@/lib/money";

/** Precarga de un campo de monto: vacío si no hay nada que mostrar (0 o
 * `null`/`undefined`), para no forzar "$ 0,00" en un campo que el admin
 * todavía no completó. */
export function textoMonto(centavos: number | null | undefined): string {
  return centavos !== null && centavos !== undefined && centavos > 0 ? formatMontoDisplay(centavos) : "";
}
