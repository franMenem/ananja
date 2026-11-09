"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCargasParecidas } from "@/components/revendedores/aviso-carga-repetida";
import type { FilaLote } from "@/components/lotes/selector-lote";
import type { FilaRevision, ItemEntrega, StockAlert } from "@/components/revendedores/entrega/tipos";
import { busquedaDeEntrega } from "@/lib/dominio/cargas-parecidas";
import {
  devolverTodo,
  devolverTodoDeProducto,
  itemsDeDevolucion,
  primerExceso,
  type PedidoEnPoder,
} from "@/lib/dominio/devolucion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { ERRORES_FERIA_EN_VENTA_PROPIA, mensajeErrorFeria } from "@/lib/dominio/feria";
import { itemsDegustacionFeria, totalDegustacion } from "@/lib/dominio/feria-admin";
import { feriaCargarDegustacion } from "@/lib/ferias";
import { formatFechaSinAnio, hoyISO } from "@/lib/fechas";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { fusionarFilasDuplicadas, hayDescuadre } from "@/lib/dominio/lotes-split";
import { formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { envase } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

const ERRORES_RPC: Record<string, string> = {
  REVENDEDOR_INVALIDO: "Este vendedor ya no es revendedor.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
  LOTE_INVALIDO: "Hubo un problema con el pedido elegido. Revisá el reparto por pedido y probá de nuevo.",
  ITEM_DUPLICADO: "Hubo un problema con el pedido elegido. Revisá el reparto por pedido y probá de nuevo.",
  COSTO_INVALIDO: `Revisá cuánto le cobrás por ${envase(1)}: tiene que ser mayor a cero.`,
  PRECIO_SUGERIDO_INVALIDO: "Revisá el precio de venta sugerido: tiene que ser mayor a cero.",
  ...ERRORES_FERIA_EN_VENTA_PROPIA,
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
  pedidosEnPoder,
  feriaId,
  volverHref,
}: {
  vendedorId: string;
  productos: Tables<"productos">[];
  tipoInicial: "entrega" | "devolucion";
  soloDevolucion?: boolean;
  lotesConStock: LoteConStockDeProducto[];
  /** Devolución: pedidos con botellas en poder de la revendedora, por
   * producto. Si viene, la devolución se arma por pedido (siempre con
   * `lote_id`) y no con el reparto libre de `SelectorLote`. */
  pedidosEnPoder?: Record<string, PedidoEnPoder[]>;
  /** Feria de revendedoras (0078): la entrega queda marcada "de la feria" y
   * suma a la persona como participante. Sin esto, todo igual que siempre. */
  feriaId?: string;
  /** A dónde se vuelve al guardar; por defecto, la ficha de la revendedora. */
  volverHref?: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"entrega" | "devolucion">(soloDevolucion ? "devolucion" : tipoInicial);
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, 0])),
  );
  // Feria: botellas "para degustación" por producto (a cargo de Ananja, no
  // son entrega ni deuda de la revendedora). Solo se usa con `feriaId`.
  const [degustacion, setDegustacion] = useState<Record<string, number>>({});
  // Devolución por pedido: `${productoId}:${loteId}` -> cantidad a devolver.
  const [devolucion, setDevolucion] = useState<Record<string, number>>({});
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

  function setCantidadDegustacion(productoId: string, value: number) {
    setDegustacion((prev) => ({ ...prev, [productoId]: value }));
  }

  function setCantidadDevolucion(clave: string, value: number) {
    setDevolucion((prev) => ({ ...prev, [clave]: value }));
  }

  function handleDevolverTodo() {
    if (pedidosEnPoder) setDevolucion(devolverTodo(pedidosEnPoder));
  }

  function handleDevolverTodoDeProducto(productoId: string) {
    if (!pedidosEnPoder) return;
    setDevolucion((prev) => devolverTodoDeProducto(prev, productoId, pedidosEnPoder[productoId] ?? []));
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
    if (tipo === "devolucion" && pedidosEnPoder) {
      const exceso = primerExceso(devolucion, pedidosEnPoder);
      if (exceso) {
        const nombre = nombrePorProducto.get(exceso.productoId) ?? "un producto";
        setError(
          `De ${nombre} del pedido del ${formatFechaSinAnio(exceso.pedido.fecha)} solo tiene ${exceso.pedido.enPoder} en poder: no se pueden devolver ${exceso.cantidad}.`,
        );
        return null;
      }
      const itemsDevolucion = itemsDeDevolucion(devolucion, pedidosEnPoder);
      if (itemsDevolucion.length === 0) {
        setError("Cargá al menos una cantidad.");
        return null;
      }
      return itemsDevolucion;
    }

    const productosConCantidad = productos.filter((p) => (cantidades[p.id] ?? 0) > 0);

    if (productosConCantidad.length === 0) {
      setError("Cargá al menos una cantidad.");
      return null;
    }

    const productoDescuadrado = productoConLotesDescuadrados();
    if (productoDescuadrado) {
      setError(
        `Revisá de qué pedido sale ${productoDescuadrado.nombre}: las cantidades por pedido no suman ${cantidades[productoDescuadrado.id] ?? 0}.`,
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

    // Feria con SOLO degustación (ningún producto para vender): no hay
    // entrega que revisar ni registrar, se carga directo la degustación.
    if (
      feriaId &&
      tipo === "entrega" &&
      totalDegustacion(degustacion) > 0 &&
      productos.every((p) => (cantidades[p.id] ?? 0) === 0)
    ) {
      setItemsPendientes([]);
      void guardar([], false);
      return;
    }

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

  /** Carga la degustación de feria (si hay) con el pedido de la entrega.
   * Devuelve el código del error, o `null` si salió bien / no había nada. */
  async function cargarDegustacionDeFeria(items: ItemEntrega[]): Promise<string | null> {
    if (!feriaId || tipo !== "entrega") return null;
    const itemsDeg = itemsDegustacionFeria(degustacion, items);
    if (itemsDeg.length === 0) return null;
    const { error: degError } = await feriaCargarDegustacion(createClient(), {
      feriaId,
      vendedorId,
      items: itemsDeg,
      fecha,
      nota: nota.trim() || null,
    });
    return degError ? degError.message : null;
  }

  async function guardar(items: ItemEntrega[], permitirNegativo: boolean) {
    setSaving(true);
    setError(null);
    setAlerta(null);

    // Sin botellas para vender (solo degustación de feria): se salta la entrega.
    if (items.length === 0) {
      const codigoDeg = await cargarDegustacionDeFeria(items);
      setSaving(false);
      if (codigoDeg) {
        setError(`No se pudo cargar la degustación: ${mensajeErrorFeria(codigoDeg)}`);
        return;
      }
      router.push(volverHref ?? `/revendedores/${vendedorId}`);
      router.refresh();
      return;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("registrar_entrega_revendedor", {
      p_vendedor_id: vendedorId,
      p_tipo: tipo,
      p_fecha: fecha,
      p_nota: nota.trim() || undefined,
      p_items: items,
      p_permitir_negativo: permitirNegativo,
      ...(feriaId ? { p_feria_id: feriaId } : {}),
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

    // La entrega ya está guardada. Si la degustación falla, se vuelve igual
    // a la feria y el aviso del error se muestra ahí (`?errorDegustacion=`).
    const codigoDeg = await cargarDegustacionDeFeria(items);
    setSaving(false);
    const destino = volverHref ?? `/revendedores/${vendedorId}`;
    router.push(codigoDeg ? `${destino}?errorDegustacion=${encodeURIComponent(codigoDeg)}` : destino);
    router.refresh();
  }

  const totalRevision =
    revision?.reduce((acc, f) => acc + (parseMontoInput(f.costo) ?? 0) * f.cantidad, 0) ?? 0;

  return {
    tipo,
    setTipo,
    cantidades,
    setCantidad,
    degustacion,
    setCantidadDegustacion,
    devolucion,
    setCantidadDevolucion,
    handleDevolverTodo,
    handleDevolverTodoDeProducto,
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
