"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { BotonAccion } from "@/components/boton-accion";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { SelectorLote, type FilaLote } from "@/components/lotes/selector-lote";
import { SetFormHeader } from "@/components/page-header-context";
import { obtenerStockActualProducto } from "@/lib/data/stock";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { MOTIVOS_EGRESO_MANUAL } from "@/lib/dominio/movimientos-stock";
import { lotesDeProducto, type LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { fusionarFilasDuplicadas, hayDescuadre } from "@/lib/dominio/lotes-split";
import { createClient } from "@/lib/supabase/client";
import { useVendedorActual } from "@/lib/vendedor-actual";
import type { Tables } from "@/lib/types";

type Producto = Pick<
  Tables<"productos">,
  "id" | "nombre" | "presentacion_ml"
>;

/** Motivos de egreso manual — `movimientos_stock.motivo` (columna `text`
 * con `check`, no un enum de Postgres —
 * `supabase/migrations/0029_costos_reales_lote.sql`). "Ajuste" queda
 * afuera de este selector a propósito: los ajustes de stock tienen su
 * propio flujo (`/stock/insumos/ajuste`), acá el egreso manual es siempre
 * una venta suelta, una degustación, una rotura o un regalo — u "otro". */
type MotivoEgreso = (typeof MOTIVOS_EGRESO_MANUAL)[number]["value"];

type MovimientoFormProps = {
  productos: Producto[];
  /** Lotes con stock del producto elegido — ver `lib/lotes-disponibles.ts`. */
  lotesConStock: LoteConStockDeProducto[];
  /** Motivo con el que arranca el selector — "otro" por default, salvo que
   * venga de un atajo tipo "registrar degustación" (`?motivo=degustacion`
   * en `/stock/nuevo`). */
  motivoInicial?: MotivoEgreso;
};

const TITULO = "Egreso manual";

/**
 * Formulario de egreso manual de stock: producto, cantidad y nota
 * opcional. Inserta directo en `movimientos_stock` (RLS lo permite sin
 * comprobante). Antes de guardar consulta `v_stock_actual` fresco; si la
 * cantidad deja stock negativo, muestra una advertencia con "Guardar
 * igual" en vez de bloquear.
 *
 * El ingreso (producción) ya NO pasa por este componente — ver
 * `components/stock/lote-form.tsx` (varias presentaciones a la vez). Antes de esa
 * migración este componente manejaba ambos tipos (`tipo` prop); ahora es
 * siempre egreso.
 *
 * El vendedor ya no se elige: un trigger en `movimientos_stock` (ver
 * supabase/migrations/0007_vendedores_auth.sql) fuerza `vendedor_id` al
 * vendedor vinculado al usuario logueado, ignorando lo que mande el
 * cliente. El valor enviado abajo es un placeholder para satisfacer el tipo.
 */
const VENDEDOR_ID_IGNORADO_POR_TRIGGER =
  "00000000-0000-0000-0000-000000000000";

const ERRORES: Record<string, string> = {
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
};

export function MovimientoForm({
  productos,
  lotesConStock,
  motivoInicial = "otro",
}: MovimientoFormProps) {
  const router = useRouter();
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  const [productoId, setProductoId] = useState(productos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(1);
  const [motivo, setMotivo] = useState<MotivoEgreso>(motivoInicial);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<{
    stockActual: number;
    stockResultante: number;
  } | null>(null);

  // Split por lote del producto elegido (ver `SelectorLote`) — un solo
  // producto a la vez en este formulario, a diferencia de
  // ComprobanteForm/EntregaForm.
  const [filasLote, setFilasLote] = useState<FilaLote[]>([]);

  function elegirProducto(id: string) {
    setProductoId(id);
    setFilasLote([]);
  }

  /** Filas listas para `movimientos_stock.insert` — una por lote elegido
   * (fusionando duplicados, mismo criterio que ComprobanteForm/EntregaForm),
   * o una sola sin `lote_id` sin split cargado todavía. */
  function filasParaInsertar(): { lote_id?: string; cantidad: number }[] {
    if (filasLote.length === 0) return [{ cantidad }];
    return fusionarFilasDuplicadas(filasLote)
      .filter((fila) => fila.cantidad > 0)
      .map((fila) => ({ cantidad: fila.cantidad, lote_id: fila.loteId ?? undefined }));
  }

  async function guardarMovimiento() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("movimientos_stock")
      .insert(
        filasParaInsertar().map((fila) => ({
          producto_id: productoId,
          tipo: "egreso" as const,
          cantidad: fila.cantidad,
          lote_id: fila.lote_id,
          vendedor_id: VENDEDOR_ID_IGNORADO_POR_TRIGGER,
          nota: nota.trim() || null,
          motivo,
        })),
      );
    setSaving(false);

    if (insertError) {
      setError(traducirErrorRpc(insertError.message, ERRORES, "No se pudo guardar el movimiento. Probá de nuevo."));
      return;
    }

    router.push("/stock");
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!productoId) {
      setError("Elegí un producto.");
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("La cantidad debe ser mayor a cero.");
      return;
    }
    if (filasLote.length > 0 && hayDescuadre(filasLote, cantidad)) {
      setError("Revisá de qué lote sale: las cantidades por lote no suman el total.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { stock: stockActual, error: stockError } = await obtenerStockActualProducto(supabase, productoId);
    setSaving(false);

    if (stockError) {
      setError(stockError);
      return;
    }

    const stockResultante = stockActual - cantidad;
    if (stockResultante < 0) {
      setAdvertencia({ stockActual, stockResultante });
      return;
    }

    await guardarMovimiento();
  }

  const productoSeleccionado = productos.find((p) => p.id === productoId);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <SetFormHeader
        title={TITULO}
        backHref="/stock"
        backLabel="Volver a stock"
      />
      <FormHeaderDesktop />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
            Producto
          </span>
          <div className="mt-1.5 grid grid-cols-2 gap-px bg-border">
            {productos.map((producto) => (
              <button
                key={producto.id}
                type="button"
                onClick={() => elegirProducto(producto.id)}
                className={`min-h-[52px] px-3 text-[13px] font-medium transition-colors ${
                  productoId === producto.id
                    ? "bg-primary text-background"
                    : "bg-surface-raised text-text"
                }`}
              >
                {producto.nombre}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
            Cantidad
          </span>
          <div className="mt-1.5">
            <CantidadStepper
              value={cantidad}
              onChange={setCantidad}
              min={1}
              disableAtMin={false}
            />
          </div>
          {productoId && (
            <div className="mt-2.5">
              <SelectorLote
                key={productoId}
                cantidad={cantidad}
                lotes={lotesDeProducto(lotesConStock, productoId)}
                onChange={setFilasLote}
              />
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="motivo"
            className="text-[10px] tracking-[0.22em] text-text-muted uppercase"
          >
            Motivo
          </label>
          <select
            id="motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value as MotivoEgreso)}
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          >
            {MOTIVOS_EGRESO_MANUAL.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {!vendedorLoading && vendedor && (
          <p className="text-xs text-text-muted">
            Registrando como{" "}
            <span className="font-medium">{vendedor.nombre}</span>
          </p>
        )}
        {!vendedorLoading && !vendedor && (
          <p role="alert" className="text-xs text-accent">
            Tu usuario no está vinculado a un vendedor. Pedile al dueño que
            te dé de alta desde el dashboard de Supabase.
          </p>
        )}

        <div>
          <label
            htmlFor="nota"
            className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          >
            Nota (opcional)
          </label>
          <input
            id="nota"
            type="text"
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            placeholder="Ej. rotura"
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
        </div>

        {advertencia && (
          <div className="flex flex-col gap-3 border-t-2 border-accent pt-3 text-sm">
            <p className="text-[13px] text-accent">
              Este egreso deja el stock de {productoSeleccionado?.nombre} en{" "}
              {advertencia.stockResultante} (stock actual:{" "}
              {advertencia.stockActual}).
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdvertencia(null)}
                className="min-h-12 flex-1 border border-primary px-3 text-[13px] font-medium tracking-[0.1em] text-primary uppercase"
              >
                Corregir cantidad
              </button>
              <BotonAccion
                onClick={guardarMovimiento}
                cargando={saving}
                textoCargando="Guardando…"
                className="min-h-12 flex-1 bg-accent px-3 text-[13px] font-medium tracking-[0.1em] text-background uppercase disabled:opacity-45"
              >
                Guardar igual
              </BotonAccion>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-accent">
            {error}
          </p>
        )}

        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          type="submit"
          disabled={!!advertencia}
          className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Guardar
        </BotonAccion>
      </form>
    </div>
  );
}
