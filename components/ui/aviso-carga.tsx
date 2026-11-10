import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { MensajeError } from "@/components/ui/campo";

/**
 * Aviso de "no se pudo cargar" con "Probar de nuevo" (ver `useCarga`).
 *
 * - `en-linea`: dentro de un formulario o un selector, en el lugar de lo que
 *   no cargó. No ocupa la pantalla.
 * - `pagina`: bloque centrado, mismo aspecto que `/gastos/[id]` cuando falla.
 */
export function AvisoCarga({
  mensaje,
  onReintentar,
  variante = "en-linea",
}: {
  mensaje: string;
  onReintentar: () => void;
  variante?: "en-linea" | "pagina";
}) {
  if (variante === "pagina") {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
        <span aria-hidden="true" className="h-0.5 w-10 bg-accent" />
        <p role="alert" className="font-display text-[24px] leading-[1.2] text-text">
          {mensaje}
        </p>
        <button type="button" onClick={onReintentar} className={`${BOTON_SECUNDARIO} flex px-4`}>
          Probar de nuevo
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <MensajeError>{mensaje}</MensajeError>
      <button type="button" onClick={onReintentar} className={`${BOTON_SECUNDARIO} flex px-4`}>
        Probar de nuevo
      </button>
    </div>
  );
}
