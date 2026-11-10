"use client";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import type { StockAlert } from "@/components/comprobante-form/use-guardar-comprobante";

type AlertaStockProps = {
  stockAlert: StockAlert | null;
  cantidadVendiendo: number;
  onRevisar: () => void;
  onGuardarIgual: () => void;
  /** `true` mientras se guarda: la hoja queda a la vista con el loader en
   * "Guardar igual" y se cierra sola cuando el guardado termina. */
  guardando: boolean;
};

/** Hoja "Stock insuficiente" — con "Revisar cantidades" o "Guardar igual"
 * (permitir negativo). Extraído de `components/comprobante-form.tsx`. */
export function AlertaStock({
  stockAlert,
  cantidadVendiendo,
  onRevisar,
  onGuardarIgual,
  guardando,
}: AlertaStockProps) {
  return (
    <BottomSheet
      open={stockAlert !== null}
      ariaLabel="Stock insuficiente"
      variant="accent"
      onClose={onRevisar}
      bloqueada={guardando}
    >
      {stockAlert && (
        <>
          <span className="text-[13px] font-medium text-accent">
            Stock insuficiente
          </span>

          <div className="mt-3 flex items-start gap-5">
            <div className="shrink-0">
              <span className="font-display block text-[40px] leading-[0.85] text-accent tabular-nums">
                {Math.max(stockAlert.disponible, 0)}
              </span>
              <span className="text-[13px] text-text-muted">
                Disponibles
              </span>
            </div>
            <p className="font-display text-[22px] leading-[1.3] text-text">
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
              disabled={guardando}
              className="min-h-11 flex-1 border border-primary px-4 text-[16px] font-medium text-primary disabled:opacity-45 rounded-xl"
            >
              Revisar cantidades
            </button>
            <BotonAccion
              onClick={onGuardarIgual}
              cargando={guardando}
              className="min-h-11 flex-1 bg-accent px-4 text-[16px] font-medium text-primary-foreground"
            >
              Guardar igual
            </BotonAccion>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
