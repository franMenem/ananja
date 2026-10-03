"use client";

import { useState } from "react";

import { useCobradoAhora } from "@/components/comprobante-cobro-campos";
import { AccionesGuardar } from "@/components/comprobante-form/acciones-guardar";
import { AlertaStock } from "@/components/comprobante-form/alerta-stock";
import { SeccionCliente } from "@/components/comprobante-form/seccion-cliente";
import { SeccionEnvases } from "@/components/comprobante-form/seccion-envases";
import { SeccionFoto } from "@/components/comprobante-form/seccion-foto";
import { SeccionMedio } from "@/components/comprobante-form/seccion-medio";
import { SeccionMonto } from "@/components/comprobante-form/seccion-monto";
import { SeccionQuien } from "@/components/comprobante-form/seccion-quien";
import type { ComprobanteFormInitial } from "@/components/comprobante-form/tipos";
import { useCatalogosComprobante } from "@/components/comprobante-form/use-catalogos-comprobante";
import { useComprobanteFoto } from "@/components/comprobante-form/use-comprobante-foto";
import { useGuardarComprobante } from "@/components/comprobante-form/use-guardar-comprobante";
import { useItemsComprobante } from "@/components/comprobante-form/use-items-comprobante";
import { useOcrMonto } from "@/components/comprobante-form/use-ocr-monto";
import { hoyISO } from "@/lib/fechas";
import type { Enums } from "@/lib/types";
import { useVendedorActual } from "@/lib/vendedor-actual";

export type { ComprobanteFormInitial } from "@/components/comprobante-form/tipos";

type MedioPago = Enums<"medio_pago">;

type ComprobanteFormProps = {
  mode: "crear" | "editar";
  comprobanteId?: string;
  initial?: ComprobanteFormInitial;
  /**
   * `comprobantes.feria_id` ya guardado (solo `mode: "editar"`) — sin UI de
   * Ferias, este componente nunca la asigna ni la muestra, pero
   * `actualizar_comprobante` rechaza con `FERIA_NO_MODIFICABLE` cualquier
   * update que no mande de vuelta el mismo valor que ya tiene la fila (ver
   * supabase/migrations/0031_margen_ventas.sql). Un comprobante viejo de
   * cuando existía Ferias necesita este passthrough invisible para poder
   * seguir editándose.
   */
  feriaIdActual?: string | null;
  /** A dónde volver tras guardar. Default `/comprobantes`. */
  volverA?: string;
};

/**
 * Formulario de una sola pantalla para cargar/editar un comprobante de
 * pago (US1 — el corazón de la app). Ver contracts/screens.md § /comprobantes
 * y contracts/database.md § crear_comprobante/actualizar_comprobante.
 *
 * Orquesta los hooks de `components/comprobante-form/*` (catálogos, foto +
 * OCR del monto, ítems/lotes/precios, guardado) y compone las secciones de
 * la pantalla (`SeccionFoto`, `SeccionMonto`, ...) — cada una recibe solo
 * las props que necesita, no el estado completo.
 */
export function ComprobanteForm({
  mode,
  comprobanteId,
  initial,
  feriaIdActual,
  volverA,
}: ComprobanteFormProps) {
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  // --- Foto / OCR del monto ------------------------------------------
  const ocr = useOcrMonto(initial?.montoCentavos);
  const foto = useComprobanteFoto(initial?.imagenPath ?? null, ocr);

  // --- Cobrado ahora (Ventas a crédito) -------------------------------
  const {
    cobradoInput,
    handleCobradoInputChange,
    cobradoCentavos: cobradoCentavosDelInput,
    quedaACobrarCentavos,
    esVentaACredito,
  } = useCobradoAhora(mode, ocr.montoInput, initial?.cobradoCentavos);

  // --- Medio de pago ---------------------------------------------------
  const [medioPago, setMedioPago] = useState<MedioPago | null>(
    initial?.medioPago ?? null,
  );

  // --- Catálogos (productos, lotes con stock) -------------------------
  const catalogos = useCatalogosComprobante(mode, initial?.items ?? []);

  // --- Productos / cantidades / lotes / precio por botella ------------
  const items = useItemsComprobante(initial, catalogos.productos, catalogos.lotesConStock);

  // --- Fecha / nota -------------------------------------------
  const [fecha, setFecha] = useState(initial?.fecha ?? hoyISO());
  const [nota, setNota] = useState(initial?.nota ?? "");

  // --- Cliente (opcional, US7) -------------------------------------------
  const [clienteId, setClienteId] = useState<string | null>(
    initial?.clienteId ?? null,
  );

  // --- Guardado ---------------------------------------------------------
  const guardar = useGuardarComprobante({
    mode,
    comprobanteId,
    feriaIdActual,
    volverA,
    uploading: foto.uploading,
    montoInput: ocr.montoInput,
    cobradoCentavos: cobradoCentavosDelInput,
    clienteId,
    medioPago,
    productos: catalogos.productos,
    cantidades: items.cantidades,
    precios: items.precios,
    lotesPorProducto: items.lotesPorProducto,
    itemsPayload: items.itemsPayload,
    imagenPath: foto.imagenPath,
    fecha,
    nota,
    ocrEstado: ocr.ocrEstado,
    ocrMontoCentavos: ocr.ocrMontoCentavos,
  });

  // Cuántas unidades de `stockAlert.producto` está cargando este formulario
  // — se usa solo para redactar la hoja de "stock insuficiente".
  const { stockAlert } = guardar;
  const cantidadVendiendoAlerta = stockAlert
    ? (items.cantidades[
        catalogos.productos.find((p) => p.nombre === stockAlert.producto)?.id ?? ""
      ] ?? 0)
    : 0;

  return (
    <form onSubmit={guardar.handleFormSubmit} className="flex flex-col gap-6 pb-8">
      <SeccionFoto
        cameraInputRef={foto.cameraInputRef}
        fileInputRef={foto.fileInputRef}
        previewUrl={foto.previewUrl}
        previewIsPdf={foto.previewIsPdf}
        fileName={foto.fileName}
        uploading={foto.uploading}
        uploadError={foto.uploadError}
        onFileChange={foto.handleFileChange}
        onRetryUpload={foto.handleRetryUpload}
      />

      <SeccionMonto
        montoInput={ocr.montoInput}
        onMontoInputChange={ocr.handleMontoInputChange}
        ocrEstado={ocr.ocrEstado}
        montoAutocompletado={ocr.montoAutocompletado}
        cobradoInput={cobradoInput}
        onCobradoInputChange={handleCobradoInputChange}
        esVentaACredito={esVentaACredito}
        quedaACobrarCentavos={quedaACobrarCentavos}
      />

      <SeccionMedio medioPago={medioPago} onMedioPagoChange={setMedioPago} />

      <SeccionEnvases
        productos={catalogos.productos}
        productosLoading={catalogos.productosLoading}
        cantidades={items.cantidades}
        onCantidadChange={items.setCantidad}
        lotesConStock={catalogos.lotesConStock}
        lotesIniciales={items.lotesIniciales}
        incluirSinLote={mode === "editar"}
        onLotesChange={items.handleLotesChange}
        precios={items.precios}
        onPrecioChange={items.handlePrecioInputChange}
        totalPreciosCentavos={items.totalPreciosCentavos}
        montoInput={ocr.montoInput}
      />

      <SeccionQuien
        vendedorLoading={vendedorLoading}
        vendedorExiste={vendedor != null}
        vendedorNombre={vendedor?.nombre}
        fecha={fecha}
        onFechaChange={setFecha}
        nota={nota}
        onNotaChange={setNota}
      />

      <SeccionCliente
        clienteId={clienteId}
        onClienteChange={setClienteId}
        esVentaACredito={esVentaACredito}
      />

      <AccionesGuardar
        submitting={guardar.submitting}
        uploading={foto.uploading}
        formError={guardar.formError}
        showRetry={guardar.showRetry}
        onRetry={() => void guardar.handleSubmit(guardar.permitirNegativoRef.current)}
        resumenDescuento={items.resumenDescuento}
      />

      <AlertaStock
        stockAlert={stockAlert}
        cantidadVendiendo={cantidadVendiendoAlerta}
        onRevisar={() => guardar.setStockAlert(null)}
        onGuardarIgual={() => {
          guardar.setStockAlert(null);
          void guardar.handleSubmit(true);
        }}
      />
    </form>
  );
}
