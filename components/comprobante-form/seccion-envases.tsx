"use client";

import { MontoInput } from "@/components/monto-input";
import { CLASE_CAJA_MONTO, CLASE_INPUT_EN_CAJA } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { SelectorLote, type FilaLote } from "@/components/lotes/selector-lote";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { lotesDeProducto } from "@/lib/dominio/lotes-disponibles";
import { NEGOCIO, capitalizar, concordar } from "@/lib/negocio";
import { formatCentavos, parseMontoInput } from "@/lib/money";
import type { Tables } from "@/lib/types";

type Producto = Tables<"productos">;

type SeccionEnvasesProps = {
  productos: Producto[];
  productosLoading: boolean;
  cantidades: Record<string, number>;
  onCantidadChange: (productoId: string, value: number) => void;
  lotesConStock: LoteConStockDeProducto[];
  lotesIniciales: Record<string, FilaLote[]>;
  incluirSinLote: boolean;
  onLotesChange: (productoId: string, filas: FilaLote[]) => void;
  precios: Record<string, string>;
  onPrecioChange: (productoId: string, value: string) => void;
  totalPreciosCentavos: number | null;
  montoInput: string;
};

/** Paso 4 · Envases vendidos (cantidad, split por lote y precio por
 * botella de cada producto) — extraído de `components/comprobante-form.tsx`. */
export function SeccionEnvases({
  productos,
  productosLoading,
  cantidades,
  onCantidadChange,
  lotesConStock,
  lotesIniciales,
  incluirSinLote,
  onLotesChange,
  precios,
  onPrecioChange,
  totalPreciosCentavos,
  montoInput,
}: SeccionEnvasesProps) {
  return (
    <SeccionForm
      titulo={`${capitalizar(NEGOCIO.envase.plural)} ${concordar("vendidos", "vendidas")}`}
      descripcion="Sumá las que vendiste de cada tamaño."
    >
      {productosLoading ? (
        <p className="py-3 text-[16px] text-text-muted">Cargando productos…</p>
      ) : (
        <div className="flex flex-col">
          {productos.map((producto) => {
            const cantidad = cantidades[producto.id] ?? 0;
            return (
              <div
                key={producto.id}
                className="flex flex-col gap-2 border-b border-border py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-[17px] font-semibold text-text">
                    {producto.nombre}
                  </span>
                  <CantidadStepper
                    value={cantidad}
                    onChange={(value) => onCantidadChange(producto.id, value)}
                    editable={false}
                    ariaLabelRestar={`Restar ${producto.nombre}`}
                    ariaLabelSumar={`Sumar ${producto.nombre}`}
                  />
                </div>
                {cantidad > 0 && (
                  <SelectorLote
                    cantidad={cantidad}
                    lotes={lotesDeProducto(lotesConStock, producto.id)}
                    initial={lotesIniciales[producto.id]}
                    incluirSinLote={incluirSinLote}
                    onChange={(filas) => onLotesChange(producto.id, filas)}
                    ariaLabelSufijo={` de ${producto.nombre}`}
                  />
                )}
                {cantidad > 0 && (
                  <MontoInput
                    id={`precio-${producto.id}`}
                    label="Precio por botella (opcional)"
                    value={precios[producto.id] ?? ""}
                    onChange={(valor) => onPrecioChange(producto.id, valor)}
                    placeholder="0,00"
                    cajaClassName={CLASE_CAJA_MONTO}
                    inputClassName={`${CLASE_INPUT_EN_CAJA} text-right`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {totalPreciosCentavos !== null &&
        (() => {
          const montoParaComparar = parseMontoInput(montoInput);
          const difiere =
            montoParaComparar !== null && montoParaComparar !== totalPreciosCentavos;
          return (
            <p className="pt-1 text-[14px] text-text-muted">
              Los precios por botella suman {formatCentavos(totalPreciosCentavos)}
              {difiere && montoParaComparar !== null
                ? `, la venta dice ${formatCentavos(montoParaComparar)}.`
                : "."}
            </p>
          );
        })()}
    </SeccionForm>
  );
}
