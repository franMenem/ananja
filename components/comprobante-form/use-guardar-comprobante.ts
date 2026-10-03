"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  interpretarErrorComprobante,
  validarComprobanteForm,
  type ItemComprobantePayload,
  type StockAlertComprobante,
} from "@/lib/dominio/comprobantes";
import { notificarPush } from "@/lib/push-client";
import { createClient } from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/types";

type Producto = Tables<"productos">;
type MedioPago = Enums<"medio_pago">;
type EstadoOcr = Enums<"estado_ocr">;

export type StockAlert = StockAlertComprobante;

export type UseGuardarComprobanteArgs = {
  mode: "crear" | "editar";
  comprobanteId?: string;
  feriaIdActual?: string | null;
  volverA?: string;
  uploading: boolean;
  montoInput: string;
  cobradoCentavos: number | null;
  clienteId: string | null;
  medioPago: MedioPago | null;
  productos: Producto[];
  cantidades: Record<string, number>;
  precios: Record<string, string>;
  lotesPorProducto: Record<string, { loteId: string | null; cantidad: number }[]>;
  itemsPayload: ItemComprobantePayload[];
  imagenPath: string | null;
  fecha: string;
  nota: string;
  ocrEstado: EstadoOcr;
  ocrMontoCentavos: number | null;
};

export type UseGuardarComprobanteResult = {
  submitting: boolean;
  formError: string | null;
  stockAlert: StockAlert | null;
  setStockAlert: (alerta: StockAlert | null) => void;
  permitirNegativoRef: React.RefObject<boolean>;
  handleSubmit: (permitirNegativo: boolean) => Promise<void>;
  handleFormSubmit: (event: React.FormEvent) => void;
  showRetry: boolean;
};

/**
 * Validación, guardado (`crear_comprobante`/`actualizar_comprobante`) y
 * traducción de errores de `ComprobanteForm` — extraído de
 * `components/comprobante-form.tsx`. Las validaciones puras y la
 * traducción de errores viven en `lib/dominio/comprobantes.ts` (testeadas
 * ahí); este hook solo hace el I/O (Supabase, push, navegación) y guarda el
 * estado de envío.
 */
export function useGuardarComprobante(args: UseGuardarComprobanteArgs): UseGuardarComprobanteResult {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [stockAlert, setStockAlert] = useState<StockAlert | null>(null);
  const permitirNegativoRef = useRef(false);

  function handleRpcError(error: { message?: string; details?: string }) {
    const resultado = interpretarErrorComprobante(error, args.productos);
    if (resultado.tipo === "stock") {
      setStockAlert(resultado.alerta);
    } else {
      setFormError(resultado.mensaje);
    }
  }

  async function handleSubmit(permitirNegativo: boolean) {
    setFormError(null);
    permitirNegativoRef.current = permitirNegativo;

    const validacion = validarComprobanteForm({
      uploading: args.uploading,
      montoInput: args.montoInput,
      cobradoCentavos: args.cobradoCentavos,
      clienteId: args.clienteId,
      medioPago: args.medioPago,
      itemsCount: args.itemsPayload.length,
      productos: args.productos,
      cantidades: args.cantidades,
      precios: args.precios,
      lotesPorProducto: args.lotesPorProducto,
    });

    if (!validacion.ok) {
      setFormError(validacion.error);
      return;
    }

    const { montoCentavos, cobradoCentavos, medioPago } = validacion;

    setSubmitting(true);

    try {
      const supabase = createClient();

      const baseArgs = {
        p_monto_centavos: montoCentavos,
        p_medio_pago: medioPago,
        // `comprobantes.imagen_path` es nullable desde la migración 0011
        // (le sacó el NOT NULL) y sin ningún CHECK que la exija desde la
        // 0025 (ventas de una feria o a crédito no llevan foto) — mandar
        // `null` acá es correcto y es justo lo que "sin foto" significa.
        // El generador de tipos de Supabase no modela la nulabilidad de
        // los argumentos escalares de una función (a diferencia de las
        // columnas de tabla): como `crear_comprobante`/`actualizar_comprobante`
        // no tienen `default` para `p_imagen_path`, el generador lo tipa
        // `string` a secas, aunque la función acepte perfectamente que ese
        // `string` sea, en runtime, `null`. Por eso la aserción: el dato
        // real (columna nullable, sin default) no cambia, el tipo generado
        // es el que se queda corto.
        p_imagen_path: (args.imagenPath && args.imagenPath.length > 0
          ? args.imagenPath
          : null) as string,
        p_fecha: args.fecha,
        p_nota: args.nota.trim() || undefined,
        p_items: args.itemsPayload,
        p_permitir_negativo: permitirNegativo,
        p_estado_ocr: args.ocrEstado,
        p_ocr_monto_centavos: args.ocrMontoCentavos ?? undefined,
        p_cliente_id: args.clienteId ?? undefined,
        // `cobradoCentavos` ya se validó no-null arriba: llega siempre como
        // número, a diferencia de `clienteId`, que sí puede faltar.
        p_cobrado_centavos: cobradoCentavos,
        p_feria_id: args.feriaIdActual ?? undefined,
      };

      const { data, error } =
        args.mode === "crear"
          ? await supabase.rpc("crear_comprobante", baseArgs)
          : await supabase.rpc("actualizar_comprobante", {
              ...baseArgs,
              p_comprobante_id: args.comprobanteId!,
            });

      if (error) {
        handleRpcError(error);
        return;
      }

      // Web Push (US5) solo si el RPC trajo alertas de stock bajo —
      // best-effort, nunca bloquea el flujo de guardado. El servidor arma
      // el título/detalle reales a partir del `producto_id` (hardening del
      // hallazgo #3 de la auditoría de seguridad): acá solo se resuelve el
      // id del producto que originó cada alerta ("stock_bajo:Nombre") contra
      // la lista de productos ya cargada en este formulario.
      const alertas = (data as { alertas?: string[] } | null)?.alertas ?? [];
      for (const alerta of alertas) {
        const nombreAlerta = alerta.replace(/^stock_bajo:/, "");
        const producto = args.productos.find((p) => p.nombre === nombreAlerta);
        if (producto) {
          void notificarPush("stock_bajo", producto.id);
        }
      }

      router.push(args.volverA ?? "/comprobantes");
      router.refresh();
    } catch {
      setFormError(
        "No se pudo guardar por un problema de conexión. Los datos quedaron cargados: revisá tu conexión e intentá de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    void handleSubmit(false);
  }

  const showRetry =
    formError !== null &&
    formError.startsWith("No se pudo guardar por un problema de conexión");

  return {
    submitting,
    formError,
    stockAlert,
    setStockAlert,
    permitirNegativoRef,
    handleSubmit,
    handleFormSubmit,
    showRetry,
  };
}
