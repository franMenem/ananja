"use client";

import { MontoInput } from "@/components/monto-input";
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
    <div className="flex flex-col gap-1">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        4 · {capitalizar(NEGOCIO.envase.plural)}{" "}
        {concordar("vendidos", "vendidas")}
      </span>
      {productosLoading ? (
        <p className="py-3 text-sm text-text-muted">Cargando productos…</p>
      ) : (
        <div className="flex flex-col">
          {productos.map((producto) => {
            const cantidad = cantidades[producto.id] ?? 0;
            return (
              <div
                key={producto.id}
                className="flex flex-col gap-2 border-b border-border py-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-[21px] text-primary">
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
                    labelEnLinea
                    value={precios[producto.id] ?? ""}
                    onChange={(valor) => onPrecioChange(producto.id, valor)}
                    placeholder="0,00"
                    labelClassName="text-[11px] text-text-muted"
                    cajaClassName="flex shrink-0 items-baseline gap-1 border-b border-border pb-0.5"
                    simboloClassName="text-xs text-text-muted"
                    inputClassName="w-24 bg-transparent text-right text-base text-text tabular-nums focus:outline-none"
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
            <p className="pt-1 text-[11px] text-text-muted">
              Los precios por botella suman {formatCentavos(totalPreciosCentavos)}
              {difiere && montoParaComparar !== null
                ? `, la venta dice ${formatCentavos(montoParaComparar)}.`
                : "."}
            </p>
          );
        })()}
    </div>
  );
}
