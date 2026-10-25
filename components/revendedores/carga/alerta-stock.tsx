import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
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
      <p className="mt-2 text-[16px] text-text-muted">
        {alertaStock?.mensaje} Si igual se las llevó, podés guardar igual.
      </p>
      <div className="mt-5 flex gap-2">
        <BotonAccion
          onClick={onGuardarIgual}
          cargando={saving}
          textoCargando="Guardando…"
          className={`${BOTON_PRIMARIO} flex-[1.6] px-4`}
        >
          Guardar igual
        </BotonAccion>
        <button
          type="button"
          onClick={onCerrar}
          disabled={saving}
          className={`${BOTON_SECUNDARIO} flex-1 px-4`}
        >
          Revisar cantidades
        </button>
      </div>
    </BottomSheet>
  );
}
