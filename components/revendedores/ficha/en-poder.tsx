import { PrecioRevendedorRow } from "@/components/revendedores/precio-revendedor-row";
import { Separador } from "@/components/plata/separador";
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
 * Bloque 3 de la ficha (`/revendedores/[id]`, rediseño "de 10 bloques a
 * 5", 2026-09-16): una fila por presentación con lo que tiene en poder y a
 * cuánto se la cobra. El precio manual (`revendedor_precios`,
 * `PrecioRevendedorRow`) sigue siendo editable: todavía es el fallback que
 * usa `carga-form`/`venta-form` cuando una entrega vieja (anterior a
 * 0040_revendedores_pagos_precios.sql) no tiene costo aprobado por ítem.
 *
 * "Valor en poder" (total, 0059_valor_stock_revendedor_costo_real.sql):
 * el costo REAL de Ananja de todo lo que tiene sin vender — distinto de
 * "Le debe a Ananja" de la cabecera (lo YA vendido y no rendido). Para
 * una revendedora de un coordinador (ej. Sofi, bajo Laura) es MENOR que
 * lo que ella le debe a su coordinador: acá se ve lo que Ananja tiene en
 * juego de verdad, no el margen del coordinador.
 */
export function EnPoderFicha({ vendedorId, productos }: { vendedorId: string; productos: ProductoEnPoder[] }) {
  const valorTotalCentavos = productos.reduce((acc, p) => acc + p.valorEnPoderCentavos, 0);

  return (
    <div className="flex flex-col gap-2">
      <Separador
        titulo="Valor en poder"
        total={valorTotalCentavos > 0 ? formatCentavos(valorTotalCentavos) : undefined}
      />
      <p className="text-[12px] text-text-muted">
        Lo que le debe a {NEGOCIO.nombre} por cada {NEGOCIO.envase.singular} se aprueba en cada entrega.
        El precio de acá solo se usa para entregas viejas que no lo tienen.
      </p>
      {productos.map((p) => (
        <div key={p.id} className="flex flex-col">
          <PrecioRevendedorRow
            vendedorId={vendedorId}
            productoId={p.id}
            productoNombre={p.nombre}
            precioActualCentavos={p.precioActualCentavos}
            precioMayoristaCentavos={p.precioMayoristaCentavos}
          />
          <span className="pb-1 text-[11px] text-text-muted">En poder: {p.enPoder}</span>
        </div>
      ))}
    </div>
  );
}
