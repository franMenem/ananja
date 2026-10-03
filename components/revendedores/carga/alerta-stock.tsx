import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import type { ErrorCarga } from "@/lib/dominio/carga-revendedor";

/** "No hay stock suficiente" al confirmar: deja guardar igual (marca
 * `permitirNegativo`) o volver a revisar cantidades. */
export function AlertaStock({
  alertaStock,
  saving,
  onGuardarIgual,
  onCerrar,
}: {
  alertaStock: ErrorCarga | null;
  saving: boolean;
  onGuardarIgual: () => void;
  onCerrar: () => void;
}) {
  return (
    <BottomSheet open={alertaStock !== null} ariaLabel="No hay stock suficiente" variant="accent">
      <h2 className="font-display text-[24px] text-primary">No hay stock suficiente</h2>
      <p className="mt-2 text-sm text-text-muted">
        {alertaStock?.mensaje} Si igual se las llevó, podés guardar igual.
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
