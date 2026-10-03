"use client";

import { EVENTO_MOSTRAR_TODOS_MOVIMIENTOS } from "@/lib/eventos-cliente";

/**
 * "Cargar precios" del resumen de ganancia de una revendedora
 * (`/revendedores/[id]`): lleva a la sección "Ventas sin precio de venta"
 * y deja el cursor en el primer precio para escribir. Antes era un link
 * `#sin-precio`: si la sección ya estaba a la vista no pasaba nada, y en
 * mobile no scrolleaba porque el contenido vive dentro de `<main>` con
 * scroll propio — parecía que el botón no andaba.
 *
 * El destino puede estar oculto detrás de "Ver todos los movimientos"
 * (`MovimientosFicha` recorta a `LIMITE_MOVIMIENTOS_VISIBLES`): si no se
 * encuentra al primer intento, se dispara `EVENTO_MOSTRAR_TODOS_MOVIMIENTOS`
 * para que se expanda y se reintenta una vez.
 */
export function IrAPrecioPendiente({ destinoId, children }: { destinoId: string; children: React.ReactNode }) {
  function irAlDestino(reintentar: boolean) {
    const destino = document.getElementById(destinoId);
    if (!destino) {
      if (reintentar) {
        window.dispatchEvent(new CustomEvent(EVENTO_MOSTRAR_TODOS_MOVIMIENTOS));
        window.setTimeout(() => irAlDestino(false), 50);
      }
      return;
    }
    destino.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = destino.querySelector<HTMLInputElement>("input");
    input?.focus({ preventScroll: true });
    destino.classList.add("bg-surface-raised");
    window.setTimeout(() => destino.classList.remove("bg-surface-raised"), 1200);
  }

  return (
    <button type="button" onClick={() => irAlDestino(true)} className="border-b border-mark text-text">
      {children}
    </button>
  );
}
