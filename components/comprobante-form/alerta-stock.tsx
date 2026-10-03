"use client";

import { BottomSheet } from "@/components/bottom-sheet";
import type { StockAlert } from "@/components/comprobante-form/use-guardar-comprobante";

type AlertaStockProps = {
  stockAlert: StockAlert | null;
  cantidadVendiendo: number;
  onRevisar: () => void;
  onGuardarIgual: () => void;
};

/** Hoja "Stock insuficiente" — con "Revisar cantidades" o "Guardar igual"
 * (permitir negativo). Extraído de `components/comprobante-form.tsx`. */
export function AlertaStock({
  stockAlert,
  cantidadVendiendo,
  onRevisar,
  onGuardarIgual,
}: AlertaStockProps) {
  return (
    <BottomSheet open={stockAlert !== null} ariaLabel="Stock insuficiente" variant="accent">
      {stockAlert && (
        <>
          <span className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
            Stock insuficiente
          </span>

          <div className="mt-3 flex items-start gap-5">
            <div className="shrink-0">
              <span className="font-display block text-[72px] leading-[0.85] text-accent tabular-nums">
                {Math.max(stockAlert.disponible, 0)}
              </span>
              <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
                Disponibles
              </span>
            </div>
            <p className="font-display text-[22px] leading-[1.3] text-primary">
              Quedan {Math.max(stockAlert.disponible, 0)} unidades de{" "}
              {stockAlert.producto} y estás vendiendo{" "}
              {cantidadVendiendo}. Si guardás igual, el depósito
              queda en {stockAlert.disponible - cantidadVendiendo}.
            </p>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onRevisar}
              className="min-h-11 flex-1 border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase"
            >
              Revisar cantidades
            </button>
            <button
              type="button"
              onClick={onGuardarIgual}
              className="min-h-11 flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase"
            >
              Guardar igual
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
