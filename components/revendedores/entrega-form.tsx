"use client";

import { SetFormHeader } from "@/components/page-header-context";
import { AlertaStockEntrega } from "@/components/revendedores/entrega/alerta-stock-entrega";
import { FormularioEntrega } from "@/components/revendedores/entrega/formulario-entrega";
import { RevisionEntrega } from "@/components/revendedores/entrega/revision-entrega";
import { useEntregaForm } from "@/components/revendedores/entrega/use-entrega-form";
import type { PedidoEnPoder } from "@/lib/dominio/devolucion";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import type { Tables } from "@/lib/types";
import { type TipoEntrega } from "@/lib/dominio/tipo-entrega";

type EntregaFormProps = {
  vendedorId: string;
  vendedorNombre: string;
  productos: Tables<"productos">[];
  tipoInicial: TipoEntrega;
  /** `/revendedores/[id]/devolucion` (rediseño "de 10 bloques a 5",
   * 2026-09-16): la Entrega vive ahora en "Cargar movimiento"
   * (`carga-form.tsx`) — acá se oculta el chip Entrega/Devolución y el tipo
   * queda fijo en "devolucion". */
  soloDevolucion?: boolean;
  /** Lotes con stock de cada producto (venta/entrega, `v_stock_por_lote`) —
   * ver `lib/lotes-disponibles.ts`. Trae además el costo Ananja y el precio
   * minorista sugerido de cada lote, que precargan el paso de revisión. En
   * una devolución se reutiliza la misma lista solo para listar fechas;
   * `quedan` no aplica a un ingreso. */
  lotesConStock: LoteConStockDeProducto[];
  /** `productoId -> lote_id` de la última entrega (no devolución) de ese
   * producto a este revendedor — default de "a qué lote vuelve" una
   * devolución (ver `SelectorLote` § `loteIdPreferido`). */
  ultimoLotePorProducto?: Record<string, string>;
  /** Devolución: pedidos de los que la revendedora tiene botellas en poder,
   * por producto. Con esto la devolución solo ofrece esos pedidos, con
   * "Devolver todo", y manda siempre el `lote_id`. */
  pedidosEnPoder?: Record<string, PedidoEnPoder[]>;
  /** Entrega para una feria (0078): tipo fijo en "entrega", la entrega queda
   * marcada "de la feria". */
  feriaId?: string;
  /** Título de la pantalla (por defecto, el de entrega/devolución de siempre). */
  titulo?: string;
  /** A dónde vuelven "Guardar" y "Cancelar" (por defecto, la ficha de la revendedora). */
  volverHref?: string;
  volverLabel?: string;
};

/**
 * Formulario de entrega/devolución — mismo patrón de stepper por producto
 * que `components/stock/lote-form.tsx`. Desde el rediseño "de 10 bloques a
 * 5" (2026-09-16) la Entrega vive en "Cargar movimiento"
 * (`carga-form.tsx`, `/revendedores/[id]/carga`); este formulario sigue
 * vivo solo para la Devolución (`/revendedores/[id]/devolucion`,
 * `soloDevolucion=true`: sin el chip Entrega/Devolución, tipo fijo en
 * "devolucion").
 *
 * Una ENTREGA pasa por un segundo paso, "Revisá la entrega"
 * (0040_revendedores_pagos_precios.sql § 1): por cada producto y lote, el
 * costo Ananja del lote (solo lectura: es lo que es de Ananja), lo que se le
 * cobra a la revendedora por botella (precargado con ese costo, editable) y
 * el precio de venta sugerido (precargado con el minorista sugerido del
 * lote). Recién al confirmar se llama a `registrar_entrega_revendedor`. Una
 * devolución se guarda directo, como antes.
 *
 * Si falla con `STOCK_INSUFICIENTE` (entrega, depósito de Ananja) o
 * `STOCK_REVENDEDOR_INSUFICIENTE` (devolución, el revendedor no tiene esas
 * botellas), abre el mismo `BottomSheet` "Revisar cantidades"/"Guardar
 * igual" que `ComprobanteForm`.
 *
 * Orquestador: el estado y los handlers viven en `useEntregaForm`
 * (`components/revendedores/entrega/use-entrega-form.ts`), el paso 1 y el
 * paso 2 son sub-componentes de presentación propios.
 */
export function EntregaForm({
  vendedorId,
  vendedorNombre,
  productos,
  tipoInicial,
  soloDevolucion = false,
  lotesConStock,
  ultimoLotePorProducto = {},
  pedidosEnPoder,
  feriaId,
  titulo,
  volverHref,
  volverLabel,
}: EntregaFormProps) {
  const f = useEntregaForm({
    vendedorId,
    productos,
    tipoInicial,
    soloDevolucion,
    lotesConStock,
    pedidosEnPoder,
    feriaId,
    volverHref,
  });
  const revisando = f.revision !== null;

  return (
    <>
      <SetFormHeader
        title={
          revisando
            ? "Revisá la entrega"
            : titulo
              ? titulo
              : f.tipo === "entrega"
              ? `Entregar botellas a ${vendedorNombre}`
              : `Registrar devolución de ${vendedorNombre}`
        }
        backHref={volverHref ?? `/revendedores/${vendedorId}`}
        backLabel={volverLabel ?? "Volver al revendedor"}
      />

      <FormularioEntrega
        revisando={revisando}
        vendedorNombre={vendedorNombre}
        soloDevolucion={soloDevolucion}
        soloEntrega={feriaId !== undefined}
        tipo={f.tipo}
        onCambiarTipo={f.setTipo}
        productos={productos}
        cantidades={f.cantidades}
        onCambiarCantidad={f.setCantidad}
        degustacion={f.degustacion}
        onCambiarDegustacion={feriaId !== undefined ? f.setCantidadDegustacion : undefined}
        pedidosEnPoder={pedidosEnPoder}
        devolucion={f.devolucion}
        onCambiarDevolucion={f.setCantidadDevolucion}
        onDevolverTodo={f.handleDevolverTodo}
        onDevolverTodoDeProducto={f.handleDevolverTodoDeProducto}
        lotesConStock={lotesConStock}
        ultimoLotePorProducto={ultimoLotePorProducto}
        onLotesChange={f.handleLotesChange}
        fecha={f.fecha}
        onCambiarFecha={f.setFecha}
        nota={f.nota}
        onCambiarNota={f.setNota}
        error={f.error}
        saving={f.saving}
        onSubmit={f.handleContinuar}
        cancelarHref={volverHref ?? `/revendedores/${vendedorId}`}
      />

      {f.revision && (
        <RevisionEntrega
          vendedorNombre={vendedorNombre}
          fecha={f.fecha}
          filas={f.revision}
          nombrePorProducto={f.nombrePorProducto}
          loteDe={f.loteDe}
          onActualizarFila={f.actualizarFila}
          totalCentavos={f.totalRevision}
          error={f.error}
          saving={f.saving}
          avisoParecidas={f.aviso.parecidas}
          avisoBuscando={f.aviso.buscando}
          onAvisoGuardarIgual={() => {
            f.aviso.guardarIgual();
            void f.confirmarEntrega(f.itemsPendientes);
          }}
          onAvisoRevisar={() => {
            f.aviso.revisar();
            f.setRevision(null);
          }}
          onConfirmar={f.handleConfirmarRevision}
          onVolverAEditar={() => {
            f.limpiarError();
            f.setRevision(null);
          }}
        />
      )}

      <AlertaStockEntrega
        alerta={f.alerta}
        saving={f.saving}
        onGuardarIgual={() => void f.guardar(f.itemsPendientes, true)}
        onCerrar={() => {
          f.descartarAviso();
          f.setRevision(null);
        }}
      />
    </>
  );
}
