"use client";

import { useRouter } from "next/navigation";

import {
  interpretarErrorComprobante,
  validarComprobanteForm,
  type ItemComprobantePayload,
  type StockAlertComprobante,
} from "@/lib/dominio/comprobantes";
import { useGuardadoConAviso } from "@/components/ui/use-guardado-con-aviso";
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
  /** Aviso de stock a la vista (también mientras corre "Guardar igual"). */
  stockAlert: StockAlert | null;
  /** Cierra la hoja de aviso y vuelve a editar. */
  descartarAviso: () => void;
  handleSubmit: (permitirNegativo: boolean) => Promise<void>;
  handleFormSubmit: (event: React.FormEvent) => void;
  /** Hay un error de conexión: mostrar "Reintentar" (= `reintentar`). */
  showRetry: boolean;
  /** Repite el último envío con el mismo permiso con el que falló. */
  reintentar: () => void;
};

/**
 * Mensaje de "problema de conexión". `interpretarErrorComprobante` devuelve
 * este mismo texto para todo error de la RPC que no reconoce (por eso cuenta
 * como error de conexión y ofrece "Reintentar");
 * `tests/guardado-con-aviso-comprobante.test.tsx` fija que no se desfasen.
 */
export const MENSAJE_ERROR_DE_CONEXION =
  "No se pudo guardar por un problema de conexión. Los datos quedaron cargados: revisá tu conexión e intentá de nuevo.";

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
  // Máquina quieto → enviando → (aviso | error{deConexion}) → enviado. El
  // error de conexión queda a la vista mientras se reintenta, para que el
  // botón "Reintentar" siga en pantalla mostrando su loader.
  const guardado = useGuardadoConAviso<StockAlert>();

  function handleRpcError(error: { message?: string; details?: string }) {
    const resultado = interpretarErrorComprobante(error, args.productos);
    if (resultado.tipo === "stock") {
      guardado.avisar(resultado.alerta);
    } else {
      guardado.fallar(resultado.mensaje, { deConexion: resultado.mensaje === MENSAJE_ERROR_DE_CONEXION });
    }
  }

  async function handleSubmit(permitirNegativo: boolean) {
    if (!guardado.empezar(permitirNegativo)) return;

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
      guardado.fallar(validacion.error);
      return;
    }

    const { montoCentavos, cobradoCentavos, medioPago } = validacion;

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

      guardado.completar();
      router.push(args.volverA ?? "/comprobantes");
      router.refresh();
    } catch {
      guardado.fallar(MENSAJE_ERROR_DE_CONEXION, { deConexion: true });
    } finally {
      // No-op si la máquina ya salió de `enviando` (aviso, error o `completar()`).
      guardado.liberar();
    }
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    void handleSubmit(false);
  }

  return {
    submitting: guardado.ocupado,
    formError: guardado.mensajeError,
    stockAlert: guardado.avisoVisible,
    descartarAviso: guardado.descartarAviso,
    handleSubmit,
    handleFormSubmit,
    showRetry: guardado.reintento !== null,
    reintentar: () => void handleSubmit(guardado.reintento?.conPermiso ?? false),
  };
}
