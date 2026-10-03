"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

type CobroDelButton = { montoCentavos: number; medioPago: MedioPago };

type ComprobanteDeleteButtonProps = {
  comprobanteId: string;
  cobradoAlMomentoCentavos: number;
  medioPago: MedioPago;
  cobros: CobroDelButton[];
  items: { cantidad: number; presentacionMl: number | null }[];
};

/**
 * Lo que realmente sale de Caja al eliminar una venta no es
 * `monto_centavos` (lo vendido) sino lo cobrado: `cobrado_centavos` en el
 * medio de la venta, más cada cobro posterior en su propio medio. Se
 * agrupa por medio (un cobro en el mismo medio de la venta se suma a esa
 * línea) y se arma una frase con el medio de la venta primero y una línea
 * "y $Y de la caja {medio}" por cada otro medio con monto.
 */
function formatConsecuencia(
  items: { cantidad: number; presentacionMl: number | null }[],
  cobradoAlMomentoCentavos: number,
  medioPago: MedioPago,
  cobros: CobroDelButton[],
): string {
  const unidades = items
    .map((item) => `${item.cantidad}×${formatPresentacion(item.presentacionMl)}`)
    .join(" y ");

  const porMedio = new Map<MedioPago, number>();
  porMedio.set(medioPago, cobradoAlMomentoCentavos);
  for (const cobro of cobros) {
    porMedio.set(cobro.medioPago, (porMedio.get(cobro.medioPago) ?? 0) + cobro.montoCentavos);
  }

  const totalCobrado = [...porMedio.values()].reduce((total, monto) => total + monto, 0);

  if (totalCobrado === 0) {
    return `Se van a devolver ${unidades} al depósito. No se mueve la Caja (no había cobros).`;
  }

  const montoVenta = porMedio.get(medioPago) ?? 0;
  let cajaTexto = `se restan ${formatCentavos(montoVenta)} de la caja ${MEDIO_PAGO_LABELS[medioPago]}`;
  for (const [medio, monto] of porMedio) {
    if (medio === medioPago || monto <= 0) continue;
    cajaTexto += ` y ${formatCentavos(monto)} de la caja ${MEDIO_PAGO_LABELS[medio]}`;
  }

  return `Se van a devolver ${unidades} al depósito y ${cajaTexto}.`;
}

/**
 * Botón + hoja inferior de confirmación (design/handoff README § Modales — "Eliminar
 * comprobante"). El delete es directo sobre `comprobantes` (permitido por
 * RLS) — el `ON DELETE CASCADE` del esquema se encarga de limpiar
 * `comprobante_items` y `movimientos_stock` asociados, por eso la hoja
 * anticipa esa consecuencia en vez de un "¿estás seguro?" genérico.
 */
export function ComprobanteDeleteButton({
  comprobanteId,
  cobradoAlMomentoCentavos,
  medioPago,
  cobros,
  items,
}: ComprobanteDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("comprobantes")
      .delete()
      .eq("id", comprobanteId);

    if (deleteError) {
      setDeleting(false);
      setError("No se pudo eliminar. Probá de nuevo.");
      return;
    }

    router.push("/comprobantes");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full border border-accent px-4 text-xs font-medium tracking-[0.1em] text-accent uppercase"
      >
        Eliminar
      </button>

      <BottomSheet
        open={open}
        ariaLabel="Eliminar comprobante"
        variant="accent"
      >
        <span className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
          Eliminar comprobante
        </span>

        <p className="font-display mt-3 text-2xl text-primary tabular-nums">
          {formatConsecuencia(items, cobradoAlMomentoCentavos, medioPago, cobros)}
        </p>

        <p className="mt-2 text-xs text-text-muted">No se puede deshacer.</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={deleting}
            className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={deleting}
            textoCargando="Eliminando…"
            type="button"
            onClick={handleDelete}
            className="min-h-11 flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </div>
  );
}
