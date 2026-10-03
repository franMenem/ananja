"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCargasParecidas } from "@/components/revendedores/aviso-carga-repetida";
import type { FilaLote } from "@/components/lotes/selector-lote";
import type { FilaRevision, ItemEntrega, StockAlert } from "@/components/revendedores/entrega/tipos";
import { busquedaDeEntrega } from "@/lib/dominio/cargas-parecidas";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { fusionarFilasDuplicadas, hayDescuadre } from "@/lib/dominio/lotes-split";
import { formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { envase } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

const ERRORES_RPC: Record<string, string> = {
  REVENDEDOR_INVALIDO: "Este vendedor ya no es revendedor.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
  LOTE_INVALIDO: "Hubo un problema con el lote elegido. Revisá el split por lote y probá de nuevo.",
  ITEM_DUPLICADO: "Hubo un problema con el lote elegido. Revisá el split por lote y probá de nuevo.",
  COSTO_INVALIDO: `Revisá cuánto le cobrás por ${envase(1)}: tiene que ser mayor a cero.`,
  PRECIO_SUGERIDO_INVALIDO: "Revisá el precio de venta sugerido: tiene que ser mayor a cero.",
};

/**
 * Estado + handlers de `EntregaForm` (`components/revendedores/
 * entrega-form.tsx`): un único flujo lineal — cantidades por producto (con
 * split por lote, `SelectorLote`) → "Revisá la entrega" (solo para una
 * entrega, no una devolución) → `registrar_entrega_revendedor`. Se movió tal
 * cual estaba, sin cambiar mensajes, condiciones ni el payload del RPC.
 */
export function useEntregaForm({
  vendedorId,
  productos,
  tipoInicial,
  soloDevolucion = false,
  lotesConStock,
}: {
  vendedorId: string;
  productos: Tables<"productos">[];
  tipoInicial: "entrega" | "devolucion";
  soloDevolucion?: boolean;
  lotesConStock: LoteConStockDeProducto[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"entrega" | "devolucion">(soloDevolucion ? "devolucion" : tipoInicial);
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, 0])),
  );
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<StockAlert | null>(null);
  const [revision, setRevision] = useState<FilaRevision[] | null>(null);
  // Lo último que se intentó guardar — "Guardar igual" lo reenvía tal cual.
  const [itemsPendientes, setItemsPendientes] = useState<ItemEntrega[]>([]);
  // "Ya hay una entrega igual" (0045) — solo en entregas, no en devoluciones.
  const aviso = useCargasParecidas(vendedorId);

  // Split por lote de cada producto (ver `SelectorLote`) — vacío hasta que
  // cada selector avisa el suyo, igual que en `ComprobanteForm`.
  const [lotesPorProducto, setLotesPorProducto] = useState<Record<string, FilaLote[]>>({});

  const nombrePorProducto = new Map(productos.map((p) => [p.id, p.nombre]));

  function loteDe(productoId: string, loteId: string | null) {
    if (loteId === null) return undefined;
    return lotesConStock.find((l) => l.productoId === productoId && l.loteId === loteId);
  }

  function setCantidad(productoId: string, value: number) {
    setCantidades((prev) => ({ ...prev, [productoId]: value }));
  }

  function handleLotesChange(productoId: string, filas: FilaLote[]) {
    setLotesPorProducto((prev) => ({ ...prev, [productoId]: filas }));
  }

  function productoConLotesDescuadrados() {
    for (const p of productos) {
      const filas = lotesPorProducto[p.id];
      if (!filas || filas.length === 0) continue;
      if (hayDescuadre(filas, cantidades[p.id] ?? 0)) return p;
    }
    return null;
  }

  /** Cantidades + split por lote → filas para el RPC (sin precios). `null`
   * si hay algo para corregir (deja el error en pantalla). */
  function armarItemsBase(): ItemEntrega[] | null {
    const productosConCantidad = productos.filter((p) => (cantidades[p.id] ?? 0) > 0);

    if (productosConCantidad.length === 0) {
      setError("Cargá al menos una cantidad.");
      return null;
    }

    const productoDescuadrado = productoConLotesDescuadrados();
    if (productoDescuadrado) {
      setError(
        `Revisá de qué lote sale ${productoDescuadrado.nombre}: las cantidades por lote no suman ${cantidades[productoDescuadrado.id] ?? 0}.`,
      );
      return null;
    }

    // Igual que en ComprobanteForm: con split por lote cargado manda una
    // fila por lote (fusionando duplicados — la RPC rechaza dos filas con
    // el mismo (producto_id, lote_id), ITEM_DUPLICADO); sin split, una sola
    // fila sin lote_id.
    const items: ItemEntrega[] = [];
    for (const p of productosConCantidad) {
      const cantidad = cantidades[p.id] ?? 0;
      const filas = lotesPorProducto[p.id];
      if (filas && filas.length > 0) {
        for (const fila of fusionarFilasDuplicadas(filas)) {
          if (fila.cantidad <= 0) continue;
          items.push({
            producto_id: p.id,
            cantidad: fila.cantidad,
            lote_id: fila.loteId ?? undefined,
          });
        }
      } else {
        items.push({ producto_id: p.id, cantidad });
      }
    }
    return items;
  }

  function handleContinuar() {
    setError(null);
    const items = armarItemsBase();
    if (!items) return;

    if (tipo === "devolucion") {
      setItemsPendientes(items);
      void guardar(items, false);
      return;
    }

    setRevision(
      items.map((item) => {
        const lote = loteDe(item.producto_id, item.lote_id ?? null);
        const costo = lote?.costoAnanjaCentavos ?? null;
        const sugerido =
          lote?.precioMinoristaSugeridoCentavos && lote.precioMinoristaSugeridoCentavos > 0
            ? lote.precioMinoristaSugeridoCentavos
            : null;
        return {
          clave: `${item.producto_id}:${item.lote_id ?? ""}`,
          productoId: item.producto_id,
          loteId: item.lote_id ?? null,
          cantidad: item.cantidad,
          costo: costo !== null ? formatMontoDisplay(costo) : "",
          sugerido: sugerido !== null ? formatMontoDisplay(sugerido) : "",
          costoLote: costo,
          sinCostosDelLote: costo === null,
        };
      }),
    );
  }

  function actualizarFila(clave: string, campo: "costo" | "sugerido", valor: string) {
    setRevision((prev) =>
      prev ? prev.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)) : prev,
    );
  }

  function handleConfirmarRevision() {
    if (!revision) return;
    setError(null);

    const items: ItemEntrega[] = [];
    for (const fila of revision) {
      const nombre = nombrePorProducto.get(fila.productoId) ?? "un producto";
      const costo = parseMontoInput(fila.costo);
      if (costo === null || costo <= 0) {
        setError(`Completá cuánto le cobrás por ${envase(1)} en ${nombre}.`);
        return;
      }
      const sugerido = fila.sugerido.trim() === "" ? null : parseMontoInput(fila.sugerido);
      if (sugerido !== null && sugerido <= 0) {
        setError(`Revisá el precio de venta sugerido de ${nombre}.`);
        return;
      }
      if (fila.sugerido.trim() !== "" && sugerido === null) {
        setError(`Revisá el precio de venta sugerido de ${nombre}.`);
        return;
      }
      items.push({
        producto_id: fila.productoId,
        cantidad: fila.cantidad,
        lote_id: fila.loteId ?? undefined,
        costo_ananja_unitario_centavos: costo,
        precio_sugerido_centavos: sugerido ?? undefined,
      });
    }

    setItemsPendientes(items);
    void confirmarEntrega(items);
  }

  /** Antes de guardar la entrega, avisa si ya hay una muy parecida para esta
   * revendedora (misma fecha, producto, lote y cantidad — 0045). */
  async function confirmarEntrega(items: ItemEntrega[]) {
    setError(null);
    const busqueda = busquedaDeEntrega(
      fecha,
      items.map((i) => ({ productoId: i.producto_id, loteId: i.lote_id ?? null, cantidad: i.cantidad })),
    );
    if (!(await aviso.puedeGuardar(busqueda))) return;
    await guardar(items, false);
  }

  async function guardar(items: ItemEntrega[], permitirNegativo: boolean) {
    setSaving(true);
    setError(null);
    setAlerta(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("registrar_entrega_revendedor", {
      p_vendedor_id: vendedorId,
      p_tipo: tipo,
      p_fecha: fecha,
      p_nota: nota.trim() || undefined,
      p_items: items,
      p_permitir_negativo: permitirNegativo,
    });

    if (rpcError) {
      if (rpcError.message === "STOCK_INSUFICIENTE" || rpcError.message === "STOCK_REVENDEDOR_INSUFICIENTE") {
        let detalle: { producto?: string; disponible?: number } = {};
        try {
          detalle = JSON.parse((rpcError as { details?: string }).details ?? "{}");
        } catch {
          // sin detalle parseable, se muestra el mensaje genérico igual
        }
        setAlerta({
          producto: detalle.producto ?? "un producto",
          disponible: detalle.disponible ?? 0,
        });
        setSaving(false);
        return;
      }
      // Mismo flujo "Guardar igual" que STOCK_INSUFICIENTE, a nivel de un
      // lote puntual — el detalle trae `producto_id`, no el nombre.
      if (rpcError.message === "STOCK_LOTE_INSUFICIENTE") {
        let detalle: { producto_id?: string; disponible?: number } = {};
        try {
          detalle = JSON.parse((rpcError as { details?: string }).details ?? "{}");
        } catch {
          // sin detalle parseable, se muestra el mensaje genérico igual
        }
        setAlerta({
          producto: nombrePorProducto.get(detalle.producto_id ?? "") ?? "un producto",
          disponible: detalle.disponible ?? 0,
        });
        setSaving(false);
        return;
      }
      setError(traducirErrorRpc(rpcError.message, ERRORES_RPC, "No se pudo guardar. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/revendedores/${vendedorId}`);
    router.refresh();
  }

  const totalRevision =
    revision?.reduce((acc, f) => acc + (parseMontoInput(f.costo) ?? 0) * f.cantidad, 0) ?? 0;

  return {
    tipo,
    setTipo,
    cantidades,
    setCantidad,
    fecha,
    setFecha,
    nota,
    setNota,
    saving,
    error,
    setError,
    alerta,
    setAlerta,
    revision,
    setRevision,
    itemsPendientes,
    aviso,
    lotesPorProducto,
    nombrePorProducto,
    loteDe,
    handleLotesChange,
    handleContinuar,
    actualizarFila,
    handleConfirmarRevision,
    confirmarEntrega,
    guardar,
    totalRevision,
  };
}

export type EntregaFormState = ReturnType<typeof useEntregaForm>;
