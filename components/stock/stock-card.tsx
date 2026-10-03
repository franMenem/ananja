"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { StockBadgeContent } from "@/components/stock/stock-badge";
import { parseEnteroInput } from "@/lib/dominio/calculo-monto";
import { textoInicialCampoNumerico } from "@/lib/dominio/campo-numerico";
import type { SegmentoDeposito } from "@/lib/dominio/deposito-lotes";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

type StockRow = Tables<"v_stock_actual">;

type StockCardProps = {
  stock: StockRow;
  /**
   * Reparto por pedido de lo que queda en depósito (`lib/deposito-lotes.ts`,
   * a partir de `v_stock_por_lote.quedan`) — línea chica bajo la cifra
   * grande, sin costos y sin repetir el número que ya se ve arriba. Vacío
   * (default) cuando no hay nada que discriminar.
   */
  segmentosDeposito?: SegmentoDeposito[];
};

/**
 * Bloque de etiqueta de stock por producto en /stock: filete izquierdo de 3px
 * (bordó si bajo umbral, oliva si en regla), cifra grande en serif
 * (`StockBadgeContent`), el reparto por pedido de lo que queda
 * (`segmentosDeposito`) y, debajo, el umbral mínimo editable inline
 * (única columna de `productos` que RLS deja actualizar al cliente). Los
 * costos del último lote se movieron a Pedidos (`/stock/lotes`): acá solo
 * importa "cuánto tengo", "de qué pedido" y "me alcanza".
 */
export function StockCard({ stock, segmentosDeposito = [] }: StockCardProps) {
  const router = useRouter();

  const [editingUmbral, setEditingUmbral] = useState(false);
  const [umbralInput, setUmbralInput] = useState(
    textoInicialCampoNumerico(stock.umbral_minimo ?? 0, "entero"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardarUmbral() {
    // `null` también para una cuenta sin terminar ("10+") o texto que no se
    // entiende: nunca se guarda como si estuviera vacío.
    const umbral = parseEnteroInput(umbralInput);
    if (umbral === null || umbral < 0 || !stock.producto_id) {
      setError("Umbral inválido.");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("productos")
      .update({ umbral_minimo: umbral })
      .eq("id", stock.producto_id);
    setSaving(false);

    if (updateError) {
      setError("No se pudo guardar el umbral.");
      return;
    }
    setEditingUmbral(false);
    router.refresh();
  }

  const bajoUmbral = stock.bajo_umbral ?? false;

  return (
    <div
      className={`flex flex-col gap-3 bg-surface-raised p-[18px] md:border-r md:border-b md:border-border ${
        bajoUmbral ? "border-l-[3px] border-accent" : "border-l-[3px] border-secondary"
      }`}
    >
      <StockBadgeContent
        nombre={stock.nombre ?? ""}
        presentacionMl={stock.presentacion_ml ?? 0}
        stock={stock.stock ?? 0}
        umbralMinimo={stock.umbral_minimo ?? 0}
        bajoUmbral={bajoUmbral}
      />

      {segmentosDeposito.length > 0 && (
        <p className="text-[11px] text-text-muted tabular-nums">
          {segmentosDeposito
            .map((segmento, i) =>
              segmento.loteId ? (
                <Link
                  key={i}
                  href={`/stock/lotes/${segmento.loteId}`}
                  className="border-b border-dotted border-text-muted text-text"
                >
                  {segmento.texto}
                </Link>
              ) : (
                <span key={i}>{segmento.texto}</span>
              ),
            )
            .reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, " · ", el]), [])}
        </p>
      )}

      <div className="flex items-center gap-1.5 border-t border-border pt-3 text-[11px]">
        <span className={editingUmbral ? "flex min-h-11 items-center text-text-muted" : "text-text-muted"}>
          Umbral mínimo
        </span>
        {editingUmbral ? (
          <span className="flex flex-wrap items-start gap-1.5">
            <MontoInput
              ariaLabel="Umbral mínimo"
              tipo="entero"
              simbolo={null}
              autoFocus
              value={umbralInput}
              onChange={setUmbralInput}
              className="w-44"
              cajaClassName="flex items-center border border-border bg-surface px-1.5 focus-within:border-primary"
              inputClassName="min-h-11 w-full min-w-0 bg-transparent text-right text-base text-text tabular-nums focus:outline-none"
            />
            <BotonAccion
              onClick={guardarUmbral}
              cargando={saving}
              className="min-h-11 bg-primary px-2 text-[10px] font-medium tracking-[0.06em] text-background uppercase disabled:opacity-45"
            >
              Ok
            </BotonAccion>
            <button
              type="button"
              onClick={() => {
                setEditingUmbral(false);
                setUmbralInput(textoInicialCampoNumerico(stock.umbral_minimo ?? 0, "entero"));
                setError(null);
              }}
              className="min-h-11 px-1 text-[10px] text-text-muted uppercase"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditingUmbral(true)}
            className="whitespace-nowrap border-b border-dotted border-text-muted text-text tabular-nums"
          >
            {stock.umbral_minimo}
          </button>
        )}

        {error && (
          <p role="alert" className="w-full text-accent">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
