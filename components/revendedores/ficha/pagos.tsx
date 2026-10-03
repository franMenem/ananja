import { HistorialPagos } from "@/components/mi/historial-pagos";
import { Separador } from "@/components/plata/separador";
import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";

function hrefPagoTarea(pagoId: string): string {
  return `/tareas/pagos/${pagoId}`;
}

/** Bloque 4 de la ficha (`/revendedores/[id]`, rediseño "de 10 bloques a
 * 5", 2026-09-16): el historial de pagos, sin cambios de fondo. */
export function PagosFicha({ movimientos }: { movimientos: MovimientoPago[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Separador titulo="Pagos" />
      <HistorialPagos movimientos={movimientos} vacio="Todavía no registró pagos." hrefPago={hrefPagoTarea} />
    </div>
  );
}
