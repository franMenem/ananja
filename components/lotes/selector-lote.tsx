"use client";

import { useEffect, useRef, useState } from "react";

import { CantidadStepper } from "@/components/cantidad-stepper";
import { formatFechaSinAnio } from "@/lib/fechas";
import {
  loteUnicoConStock,
  repartirCantidadEntreLotes,
  repartirEnLotePreferido,
  totalFilas,
  type FilaLote,
  type LoteConStock,
} from "@/lib/dominio/lotes-split";
import { formatCentavos } from "@/lib/money";

export type { FilaLote, LoteConStock } from "@/lib/dominio/lotes-split";

type SelectorLoteProps = {
  /** Cantidad total del ítem (venta/entrega/devolución/egreso) que hay que
   * repartir entre lotes. `0` o negativa: el selector no muestra nada. */
  cantidad: number;
  /** Lotes de ESTE producto puntual, con su `quedan` (venta/entrega) —
   * ignorado en modo devolución salvo para listar fechas. */
  lotes: LoteConStock[];
  onChange: (filas: FilaLote[]) => void;
  /** Split ya guardado (editar un comprobante/entrega existente): se usa
   * una sola vez al montar, si su total coincide con `cantidad` — si no
   * coincide (la cantidad cambió desde que se guardó), se descarta a favor
   * del reparto por default. */
  initial?: FilaLote[];
  /** Muestra una fila extra "Sin lote" editable — solo tiene sentido al
   * editar un ítem legado que nunca tuvo lote asignado (el dueño puede
   * mover esa cantidad a un lote real desde acá). */
  incluirSinLote?: boolean;
  /**
   * Devolución: en vez de repartir del lote más viejo con stock (venta), el
   * default es un único lote — el pasado acá, o si no está entre `lotes` el
   * más nuevo (`lib/lotes-split.ts` § `repartirEnLotePreferido`). `quedan`/
   * costo no se muestran (no aplican a un ingreso). `undefined` = modo
   * venta/entrega (reparto por antigüedad, respetando `quedan`).
   */
  loteIdPreferido?: string | null;
  /** Sufijo de accesibilidad de los steppers (mismo patrón que
   * `CantidadStepper.ariaLabelSufijo`), útil cuando hay varios selectores
   * en la misma pantalla (uno por producto). */
  ariaLabelSufijo?: string;
};

/**
 * Elige de qué lote de producción sale (venta/entrega/egreso) o a cuál
 * vuelve (devolución) una cantidad — el dueño quiere poder decir "a esta
 * revendedora le di 30 botellas del lote viejo y 20 del nuevo"
 * (`comprobante_items.lote_id`/`entrega_items.lote_id`,
 * supabase/migrations/0028_costos_por_lote.sql).
 *
 * - Un solo lote con stock (o, en modo devolución, un solo lote a secas):
 *   auto-asignación silenciosa, una nota de una línea.
 * - Varios: una fila por lote con su propio stepper; el default reparte del
 *   más viejo con stock primero (venta/entrega) o pone todo en el lote
 *   preferido (devolución). El dueño puede repartir a mano — incluso a un
 *   lote con `quedan = 0`, el flujo de "permitir negativo" ya existente en
 *   cada formulario se encarga de avisar si eso deja stock negativo.
 * - Sin lotes cargados para este producto: no se muestra nada, el ítem se
 *   guarda sin `lote_id`.
 */
export function SelectorLote({
  cantidad,
  lotes,
  onChange,
  initial,
  incluirSinLote = false,
  loteIdPreferido,
  ariaLabelSufijo = "",
}: SelectorLoteProps) {
  const modoPreferido = loteIdPreferido !== undefined;

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  function reparto(cant: number): FilaLote[] {
    if (modoPreferido) {
      return repartirEnLotePreferido(cant, lotes, loteIdPreferido ?? null);
    }
    return repartirCantidadEntreLotes(cant, lotes);
  }

  // Caso "un solo lote" (con stock en modo venta/entrega; a secas en modo
  // devolución, donde "quedan" no aplica): auto-asignación silenciosa, sin
  // fila editable.
  const unico = modoPreferido
    ? lotes.length === 1
      ? lotes[0]
      : null
    : loteUnicoConStock(lotes);
  const unicoId = unico?.loteId ?? null;

  useEffect(() => {
    if (unicoId === null || cantidad <= 0) return;
    onChangeRef.current([{ loteId: unicoId, cantidad }]);
  }, [unicoId, cantidad]);

  // Caso "varios" (o ninguno con stock en modo venta): split editable a
  // mano, con un default sugerido.
  const prevCantidadRef = useRef(cantidad);
  const [filas, setFilas] = useState<FilaLote[]>(() => {
    if (unicoId !== null || lotes.length === 0) return [];
    if (initial && totalFilas(initial) === cantidad) return initial;
    return reparto(cantidad);
  });

  useEffect(() => {
    if (unicoId !== null || lotes.length === 0) return;
    if (prevCantidadRef.current === cantidad) return;
    prevCantidadRef.current = cantidad;
    setFilas(reparto(cantidad));
    // Recalcula el default SOLO cuando cambia la cantidad total del ítem —
    // no cuando cambia la lista de lotes (misma referencia toda la vida de
    // la pantalla) ni cuando el propio usuario edita una fila a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantidad]);

  useEffect(() => {
    if (unicoId !== null || lotes.length === 0) return;
    onChangeRef.current(filas.filter((fila) => fila.cantidad > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas]);

  if (cantidad <= 0 || lotes.length === 0) return null;

  if (unico) {
    return (
      <p className="text-[11px] text-text-muted">
        {modoPreferido
          ? `Vuelve al lote del ${formatFechaSinAnio(unico.fecha)}`
          : `Del lote del ${formatFechaSinAnio(unico.fecha)} (quedan ${unico.quedan})`}
      </p>
    );
  }

  function cantidadDe(loteId: string | null): number {
    return filas.find((fila) => fila.loteId === loteId)?.cantidad ?? 0;
  }

  function actualizarFila(loteId: string | null, nuevaCantidad: number) {
    setFilas((prev) => {
      if (prev.some((fila) => fila.loteId === loteId)) {
        return prev.map((fila) =>
          fila.loteId === loteId ? { ...fila, cantidad: nuevaCantidad } : fila,
        );
      }
      return [...prev, { loteId, cantidad: nuevaCantidad }];
    });
  }

  const ordenados = [...lotes].sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0,
  );
  const total = totalFilas(filas);
  const descuadrado = total !== cantidad;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2.5">
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
        De qué lote
      </span>
      {ordenados.map((lote) => (
        <div key={lote.loteId} className="flex items-start justify-between gap-3">
          <span className="min-w-0 flex-1 text-[12px] text-text">
            Lote del {formatFechaSinAnio(lote.fecha)}
            {!modoPreferido && <> · quedan {lote.quedan}</>}
            {!modoPreferido && lote.costoUnitarioCentavos != null && (
              <> · costo {formatCentavos(lote.costoUnitarioCentavos)}</>
            )}
          </span>
          <div className="shrink-0">
            <CantidadStepper
              value={cantidadDe(lote.loteId)}
              onChange={(value) => actualizarFila(lote.loteId, value)}
              size="sm"
              disableAtMin={false}
              ariaLabelSufijo={` del lote del ${formatFechaSinAnio(lote.fecha)}${ariaLabelSufijo}`}
            />
          </div>
        </div>
      ))}
      {incluirSinLote && (
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 flex-1 text-[12px] text-text-muted">
            Sin lote (se descuenta del más viejo)
          </span>
          <div className="shrink-0">
            <CantidadStepper
              value={cantidadDe(null)}
              onChange={(value) => actualizarFila(null, value)}
              size="sm"
              disableAtMin={false}
              ariaLabelSufijo={` sin lote${ariaLabelSufijo}`}
            />
          </div>
        </div>
      )}
      {descuadrado && (
        <p role="alert" className="text-[11px] text-accent">
          Asignaste {total} de {cantidad} — ajustá las cantidades para que coincidan.
        </p>
      )}
    </div>
  );
}
