import { GananciaRevendedor } from "@/components/revendedores/ganancia-revendedor";
import { formatDiaMesHora, formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import type { VentaGanancia } from "@/lib/dominio/ganancia-revendedor";
import type { VentaBorrada } from "@/lib/dominio/ventas-revendedor";

/**
 * Bloque 6 de la ficha (`/revendedores/[id]`, rediseño "de 10 bloques a
 * 5", 2026-09-16): dos `<details>` al pie, plegados por defecto —
 * "Ver ganancia como revendedora" (`GananciaRevendedor` con su gráfico) y
 * "Ventas borradas (N)" (solo si hay alguna).
 */
export function PlegadosFicha({
  ventasGanancia,
  ventasBorradas,
  nombrePorProducto,
  nombreBorrador,
}: {
  ventasGanancia: VentaGanancia[];
  ventasBorradas: VentaBorrada[];
  nombrePorProducto: Map<string, string>;
  nombreBorrador: Map<string, string>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <details className="group">
        <summary className="flex items-center gap-1.5 select-none text-[10px] tracking-[0.22em] text-text-muted uppercase [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Ver ganancia como revendedora
        </summary>
        <div className="mt-3">
          <GananciaRevendedor persona="ella" ventas={ventasGanancia} />
        </div>
      </details>

      {ventasBorradas.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 select-none text-[10px] tracking-[0.22em] text-text-muted uppercase [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            Ventas borradas ({ventasBorradas.length})
          </summary>
          <div className="mt-2 flex flex-col">
            {ventasBorradas.map((v) => (
              <div
                key={`${v.grupoId}-${v.borradaPor ?? ""}`}
                className="flex items-start justify-between gap-3 border-b border-border py-3 text-sm"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-text-muted">
                    {formatFecha(v.fecha)} · {nombrePorProducto.get(v.productoId) ?? "?"} × {v.cantidad}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    Borrada por{" "}
                    {v.borradaPor ? (nombreBorrador.get(v.borradaPor) ?? "alguien") : "alguien fuera de la app"}{" "}
                    el {formatDiaMesHora(v.borradaAt)}
                  </span>
                </div>
                <span className="shrink-0 text-right tabular-nums text-text-muted">
                  {v.precioVentaCentavos !== null ? `${formatCentavos(v.precioVentaCentavos)} c/u` : "Sin precio"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
