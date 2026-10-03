"use client";

import { useState } from "react";

import { textoMonto } from "@/components/revendedores/carga/formato";
import type { FilaEntregaEstado } from "@/components/revendedores/carga/tipos";
import { campoNumericoInvalido } from "@/lib/dominio/campo-numerico";
import { loteParaEntrega, type EntregaCarga } from "@/lib/dominio/carga-revendedor";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { parseMontoInput } from "@/lib/money";

/**
 * Estado + handlers de la sección 1 (Entrega) de `CargaForm`: fecha, una
 * fila por presentación con su lote/costo/sugerido precargados, y el
 * `EntregaCarga` (input puro de `lib/dominio/carga-revendedor.ts`) que sale
 * de ahí, `null` mientras la sección está plegada.
 */
export function useEntregaCarga({
  productos,
  lotes,
  hoy,
  activaInicial,
}: {
  productos: { id: string; nombre: string }[];
  lotes: LoteConStockDeProducto[];
  hoy: string;
  activaInicial: boolean;
}) {
  const [activa, setActiva] = useState(activaInicial);
  const [fecha, setFecha] = useState(hoy);
  const [filas, setFilas] = useState<Record<string, FilaEntregaEstado>>(() =>
    Object.fromEntries(
      productos.map((p) => {
        const lote = loteParaEntrega(lotes, p.id, hoy);
        return [
          p.id,
          {
            cantidad: 0,
            loteId: lote?.loteId ?? null,
            loteManual: false,
            costo: textoMonto(lote?.costoAnanjaCentavos),
            sugerido: textoMonto(lote?.precioMinoristaSugeridoCentavos),
          },
        ];
      }),
    ),
  );
  const [permitirNegativo, setPermitirNegativo] = useState(false);

  function actualizarFila(productoId: string, cambio: Partial<FilaEntregaEstado>) {
    setFilas((prev) => ({ ...prev, [productoId]: { ...prev[productoId], ...cambio } }));
  }

  function cambiarLote(productoId: string, loteId: string | null) {
    const lote = loteId
      ? lotes.find((l) => l.productoId === productoId && l.loteId === loteId)
      : undefined;
    actualizarFila(productoId, {
      loteId,
      loteManual: true,
      costo: textoMonto(lote?.costoAnanjaCentavos),
      sugerido: textoMonto(lote?.precioMinoristaSugeridoCentavos),
    });
  }

  /** Al cambiar la fecha de la entrega se re-elige el lote de las filas que
   * el admin no tocó (solo lotes producidos hasta esa fecha). */
  function cambiarFecha(nuevaFecha: string) {
    setFecha(nuevaFecha);
    setFilas((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([productoId, fila]) => {
          if (fila.loteManual) return [productoId, fila];
          const lote = loteParaEntrega(lotes, productoId, nuevaFecha);
          if ((lote?.loteId ?? null) === fila.loteId) return [productoId, fila];
          return [
            productoId,
            {
              ...fila,
              loteId: lote?.loteId ?? null,
              costo: textoMonto(lote?.costoAnanjaCentavos),
              sugerido: textoMonto(lote?.precioMinoristaSugeridoCentavos),
            },
          ];
        }),
      ),
    );
  }

  const input: EntregaCarga | null = activa
    ? {
        fecha,
        permitirNegativo,
        filas: productos.map((p) => {
          const f = filas[p.id];
          const sugeridoVacio = f.sugerido.trim() === "";
          const sugerido = sugeridoVacio ? null : parseMontoInput(f.sugerido);
          return {
            productoId: p.id,
            loteId: f.loteId,
            cantidad: f.cantidad,
            costoCentavos: campoNumericoInvalido(f.costo) ? null : parseMontoInput(f.costo),
            sugeridoCentavos: sugerido,
            sugeridoInvalido: !sugeridoVacio && sugerido === null,
          };
        }),
      }
    : null;

  return {
    activa,
    toggle: () => setActiva((v) => !v),
    fecha,
    filas,
    permitirNegativo,
    setPermitirNegativo,
    actualizarFila,
    cambiarLote,
    cambiarFecha,
    input,
  };
}

export type EntregaCargaState = ReturnType<typeof useEntregaCarga>;
