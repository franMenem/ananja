"use client";

import { useState } from "react";

import { textoMonto } from "@/components/revendedores/carga/formato";
import type { LineaVentaEstado } from "@/components/revendedores/carga/tipos";
import {
  fechaVentasPorDefecto,
  precioSugeridoVenta,
  type EntregaCarga,
  type MedioPago,
  type VentasCarga,
} from "@/lib/dominio/carga-revendedor";
import { parseMontoInput } from "@/lib/money";
import type { TramoStock } from "@/lib/dominio/revendedor-stock";

/**
 * Estado + handlers de la sección 2 (Ventas) de `CargaForm`: fecha (o la de
 * la entrega, por defecto), medio de pago, líneas por producto (una o más,
 * con o sin precio, con o sin lote elegido a mano — 0062) y el `VentasCarga`
 * que sale de ahí. `tramos` es el stock FIFO ya calculado (stock existente +
 * la entrega que se está cargando, `stockConEntregaNueva`): esta sección no
 * lo recalcula, solo lo usa para precargar el precio sugerido.
 */
export function useVentasCarga({
  productos,
  tramos,
  entregaInput,
  hoy,
  activaInicial,
}: {
  productos: { id: string; nombre: string }[];
  tramos: TramoStock[];
  entregaInput: EntregaCarga | null;
  hoy: string;
  activaInicial: boolean;
}) {
  const [activa, setActiva] = useState(activaInicial);
  // `null` = sigue la fecha por defecto (la de la entrega, o hoy).
  const [fecha, setFecha] = useState<string | null>(null);
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [lineas, setLineas] = useState<Record<string, LineaVentaEstado[]>>(() =>
    Object.fromEntries(
      productos.map((p) => [
        p.id,
        [{ id: `${p.id}-0`, cantidad: 0, precio: "", sinPrecio: false, loteId: null }],
      ]),
    ),
  );
  const [siguienteLinea, setSiguienteLinea] = useState(1);

  const fechaEfectiva = fecha ?? fechaVentasPorDefecto(entregaInput, hoy);

  function actualizarLinea(productoId: string, lineaId: string, cambio: Partial<LineaVentaEstado>) {
    const sugerido = textoMonto(precioSugeridoVenta(tramos, productoId));
    setLineas((prev) => ({
      ...prev,
      [productoId]: prev[productoId].map((l) => {
        if (l.id !== lineaId) return l;
        const nueva = { ...l, ...cambio };
        // Al empezar a cargar cantidad, precarga el precio sugerido de la
        // entrega de la que saldrían las botellas.
        if (l.cantidad === 0 && nueva.cantidad > 0 && nueva.precio === "") nueva.precio = sugerido;
        return nueva;
      }),
    }));
  }

  function agregarLinea(productoId: string) {
    setLineas((prev) => ({
      ...prev,
      [productoId]: [
        ...prev[productoId],
        { id: `${productoId}-${siguienteLinea}`, cantidad: 0, precio: "", sinPrecio: false, loteId: null },
      ],
    }));
    setSiguienteLinea((n) => n + 1);
  }

  function quitarLinea(productoId: string, lineaId: string) {
    setLineas((prev) => ({
      ...prev,
      [productoId]: prev[productoId].filter((l) => l.id !== lineaId),
    }));
  }

  function venderTodo(productoId: string, total: number) {
    const lineasProducto = lineas[productoId];
    const otras = lineasProducto.slice(1).reduce((acc, l) => acc + l.cantidad, 0);
    actualizarLinea(productoId, lineasProducto[0].id, { cantidad: Math.max(total - otras, 0) });
  }

  const input: VentasCarga | null = activa
    ? {
        fecha: fechaEfectiva,
        medioPago,
        filas: productos.flatMap((p) =>
          lineas[p.id].map((l) => ({
            productoId: p.id,
            cantidad: l.cantidad,
            precioVentaCentavos: parseMontoInput(l.precio),
            sinPrecio: l.sinPrecio,
            loteId: l.loteId,
          })),
        ),
      }
    : null;

  return {
    activa,
    toggle: () => setActiva((v) => !v),
    fecha,
    fechaEfectiva,
    setFecha,
    medioPago,
    setMedioPago,
    lineas,
    actualizarLinea,
    agregarLinea,
    quitarLinea,
    venderTodo,
    input,
  };
}

export type VentasCargaState = ReturnType<typeof useVentasCarga>;
