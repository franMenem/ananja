import { PrecioRevendedorRow } from "@/components/revendedores/precio-revendedor-row";
import { Tarjeta } from "@/components/ui/tarjeta";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

export type ProductoEnPoder = {
  id: string;
  nombre: string;
  enPoder: number;
  precioActualCentavos: number | null;
  precioMayoristaCentavos: number | null;
  /** Costo REAL de Ananja de lo que tiene en poder de este producto
   * (`v_valor_stock_revendedor.valor_en_poder_ananja_centavos`, 0059) —
   * no lo que se le cobró a ella (que para una revendedora de un
   * coordinador es mayor, con su margen). */
  valorEnPoderCentavos: number;
};

/**
 * Tarjeta "Lo que tiene" de la ficha (`/revendedores/[id]`): una fila por
 * presentación con la cantidad, lo que valen a costo de Ananja y a cuánto se
 * la cobra por botella. El precio manual (`revendedor_precios`,
 * `PrecioRevendedorRow`) sigue siendo editable: es el fallback que usan los
 * formularios de carga cuando una entrega vieja (anterior a
 * 0040_revendedores_pagos_precios.sql) no tiene costo aprobado por ítem.
 *
 * El total "valen" (0059_valor_stock_revendedor_costo_real.sql) es el costo
 * REAL de Ananja de todo lo que tiene sin vender — distinto de "Le debe a
 * Ananja" (lo YA vendido y no rendido).
 */
export function EnPoderFicha({ vendedorId, productos }: { vendedorId: string; productos: ProductoEnPoder[] }) {
  const valorTotalCentavos = productos.reduce((acc, p) => acc + p.valorEnPoderCentavos, 0);
  const conBotellas = productos.filter((p) => p.enPoder > 0);

  return (
    <Tarjeta como="section" aria-labelledby="ficha-tiene" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ficha-tiene" className="text-[20px] leading-tight font-semibold text-text">
          Lo que tiene
        </h2>
        {conBotellas.length > 0 && valorTotalCentavos > 0 && (
          <span className="shrink-0 text-[16px] font-semibold tabular-nums text-text">
            Vale {formatCentavos(valorTotalCentavos)}
          </span>
        )}
      </div>
      {conBotellas.length === 0 ? (
        <p className="py-2 text-[16px] text-text-muted">No tiene botellas ahora</p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {conBotellas.map((p) => (
            <PrecioRevendedorRow
              key={p.id}
              vendedorId={vendedorId}
              productoId={p.id}
              productoNombre={p.nombre}
              enPoder={p.enPoder}
              valorEnPoderCentavos={p.valorEnPoderCentavos}
              precioActualCentavos={p.precioActualCentavos}
              precioMayoristaCentavos={p.precioMayoristaCentavos}
            />
          ))}
        </div>
      )}
      {conBotellas.length > 0 && (
        <p className="text-[14px] text-text-muted">
          Lo que le debe a {NEGOCIO.nombre} por cada {NEGOCIO.envase.singular} se aprueba en cada entrega. El precio de
          acá solo se usa para entregas viejas que no lo tienen.
        </p>
      )}
    </Tarjeta>
  );
}
