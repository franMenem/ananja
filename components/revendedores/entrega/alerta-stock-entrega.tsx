import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import type { StockAlert } from "@/components/revendedores/entrega/tipos";

/** "No hay stock suficiente" al confirmar (depósito de Ananja en una
 * entrega, o lo que tiene la revendedora en una devolución): deja guardar
 * igual (`permitirNegativo`) o volver a revisar cantidades. */
export function AlertaStockEntrega({
  alerta,
  saving,
  onGuardarIgual,
  onCerrar,
}: {
  alerta: StockAlert | null;
  saving: boolean;
  onGuardarIgual: () => void;
  onCerrar: () => void;
}) {
  return (
    <BottomSheet open={alerta !== null} ariaLabel="No hay stock suficiente" variant="accent">
      <h2 className="font-display text-[24px] text-primary">No hay stock suficiente</h2>
      <p className="mt-2 text-sm text-text-muted">
        {alerta?.producto}: quedan {alerta?.disponible} disponibles.
      </p>
      <div className="mt-5 flex gap-2">
        <BotonAccion
          onClick={onGuardarIgual}
          cargando={saving}
          textoCargando="Guardando…"
          className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
        >
          Guardar igual
        </BotonAccion>
        <button
          type="button"
          onClick={onCerrar}
          disabled={saving}
          className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
        >
          Revisar cantidades
        </button>
      </div>
    </BottomSheet>
  );
}
