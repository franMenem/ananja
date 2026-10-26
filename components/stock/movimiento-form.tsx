"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { BotonAccion } from "@/components/boton-accion";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { SelectorLote, type FilaLote } from "@/components/lotes/selector-lote";
import { AccionesForm } from "@/components/ui/acciones-form";
import { Aviso } from "@/components/ui/aviso";
import { CLASE_ETIQUETA, Campo, Entrada, MensajeError, Selector } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import { Segmentos } from "@/components/ui/segmentos";
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

const TITULO = "Sacar botellas del depósito";

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
      setError("Revisá de qué pedido sale: las cantidades por pedido no suman el total.");
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
        backLabel="Volver a botellas"
      />
      <FormHeaderDesktop />
      <p className="-mt-2 text-[15px] text-text-muted">¿Qué botellas salieron del depósito y por qué?</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <SeccionForm titulo="¿Qué botellas salieron?">
          <Segmentos
            etiqueta="Tamaño"
            opciones={productos.map((p) => ({ value: p.id, label: p.nombre }))}
            valor={productoId || null}
            onChange={elegirProducto}
            columnas={Math.min(Math.max(productos.length, 1), 2)}
          />

          <div className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Cantidad</span>
            <CantidadStepper value={cantidad} onChange={setCantidad} min={1} disableAtMin={false} />
          </div>
          {productoId && (
            <SelectorLote
              key={productoId}
              cantidad={cantidad}
              lotes={lotesDeProducto(lotesConStock, productoId)}
              onChange={setFilasLote}
            />
          )}
        </SeccionForm>

        <SeccionForm titulo="¿Por qué salieron?">
          <Campo id="motivo" etiqueta="Motivo">
            <Selector value={motivo} onChange={(event) => setMotivo(event.target.value as MotivoEgreso)}>
              {MOTIVOS_EGRESO_MANUAL.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Selector>
          </Campo>

          <Campo id="nota" etiqueta="Nota" opcional>
            <Entrada
              type="text"
              value={nota}
              onChange={(event) => setNota(event.target.value)}
              placeholder="Ej. rotura"
            />
          </Campo>
        </SeccionForm>

        {!vendedorLoading && vendedor && (
          <p className="text-[14px] text-text-muted">
            Registrando como <span className="font-semibold text-text">{vendedor.nombre}</span>
          </p>
        )}
        {!vendedorLoading && !vendedor && (
          <MensajeError>
            Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta desde el
            dashboard de Supabase.
          </MensajeError>
        )}

        {advertencia && (
          <Aviso role="alert">
            <p className="text-[15px]">
              Este egreso deja el stock de {productoSeleccionado?.nombre} en{" "}
              {advertencia.stockResultante} (stock actual: {advertencia.stockActual}).
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setAdvertencia(null)}
                className="min-h-12 flex-1 rounded-xl border border-primary bg-surface px-3 text-[16px] font-semibold text-primary"
              >
                Corregir cantidad
              </button>
              <BotonAccion
                onClick={guardarMovimiento}
                cargando={saving}
                textoCargando="Guardando…"
                className="min-h-12 flex-1 rounded-xl bg-accent px-3 text-[16px] font-semibold text-primary-foreground disabled:opacity-45"
              >
                Guardar igual
              </BotonAccion>
            </div>
          </Aviso>
        )}

        {error && <MensajeError>{error}</MensajeError>}

        <AccionesForm
          etiqueta="Guardar egreso"
          cargando={saving}
          disabled={!!advertencia}
          cancelarHref="/stock"
          fija
        />
      </form>
    </div>
  );
}
