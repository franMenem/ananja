"use client";

import type { PedidoCalculado } from "@/lib/dominio/costos-lote";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion, NEGOCIO } from "@/lib/negocio";
import type { CostosLoteState } from "@/lib/dominio/lotes";

import { SeccionForm } from "@/components/ui/seccion-form";
import { MoneyField } from "@/components/stock/costos-lote-campos/campos";

type ResumenBlockProps = {
  /** `calculo?.presentaciones ?? []` — mismo cálculo de `calcularPedido`
   * que comparten los bloques de Etiquetas y Envases. */
  preview: PedidoCalculado["presentaciones"];
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
};

/**
 * Bloque "Costo por botella" de "Costos del pedido" (`CostosLoteCampos`):
 * vista previa en vivo del costo de producción, el costo Ananja calculado
 * (editable con "Costo Ananja redondeado") y los precios sugeridos.
 */
export function ResumenBlock({ preview, value, onChange }: ResumenBlockProps) {
  function setCostoAnanjaRedondeado(productoId: string, monto: string) {
    onChange({
      ...value,
      costoAnanjaRedondeadoPorProducto: {
        ...value.costoAnanjaRedondeadoPorProducto,
        [productoId]: monto,
      },
    });
  }

  if (preview.length === 0) return null;

  return (
    <SeccionForm titulo={`Costo por ${NEGOCIO.envase.singular}`} descripcion="Así queda con lo que cargaste.">
      {preview.map((p) => (
        <div
          key={p.productoId}
          className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
        >
          <p className="text-[16px] leading-snug tabular-nums text-text">
            {formatPresentacion(p.presentacionMl)}: Costo de producción{" "}
            <strong className="font-medium text-primary">
              {formatCentavos(p.costoUnitarioCentavos)}
            </strong>
            {" → Costo Ananja calculado (+"}
            {value.gananciaPct || 0}
            {"%) "}
            <strong className="font-medium text-primary">
              {formatCentavos(p.precios.costoAnanjaCalculadoCentavos)}
            </strong>
          </p>
          <MoneyField
            id={`costo-ananja-redondeado-${p.productoId}`}
            label="Costo Ananja redondeado"
            value={value.costoAnanjaRedondeadoPorProducto[p.productoId] ?? ""}
            onChange={(v) => setCostoAnanjaRedondeado(p.productoId, v)}
            hint="Lo que les cobrás a las revendedoras. Vacío = el calculado."
          />
          <p className="text-[16px] leading-snug tabular-nums text-text">
            Mayorista sugerido{" "}
            <strong className="font-medium text-primary">
              {formatCentavos(p.precios.mayoristaSugeridoCentavos)}
            </strong>
            {" · Minorista sugerido "}
            <strong className="font-medium text-primary">
              {formatCentavos(p.precios.minoristaSugeridoCentavos)}
            </strong>
          </p>
        </div>
      ))}
    </SeccionForm>
  );
}
