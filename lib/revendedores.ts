import type { SupabaseClient } from "@supabase/supabase-js";

import type { PedidoCarga } from "@/lib/dominio/carga-revendedor";
import {
  leerCargasParecidas,
  parametrosBusquedaParecidas,
  type BusquedaParecidas,
  type CargaParecida,
} from "@/lib/dominio/cargas-parecidas";
import { leerTodasLasPaginas } from "@/lib/paginado";
import type { EntregaItemFifo } from "@/lib/dominio/revendedor-stock";
import { obtenerVendedorPorUserId } from "@/lib/rol-vendedor";
import type { Database, Enums, Tables } from "@/lib/types";

export type PagoRevendedor = Tables<"pagos_revendedor">;

/**
 * Ítems de entrega y devolución de un vendedor, con fecha/tipo de su
 * entrega — insumo de `stockPorEntrega` (`lib/revendedor-stock.ts`). Filtro
 * explícito por `vendedorId`, mismo motivo que `listarStockRevendedor`.
 */
export async function listarEntregaItemsFifo(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: EntregaItemFifo[]; error: string | null }> {
  // Paginado: el reparto FIFO necesita TODAS las entregas, no las primeras 1000 filas.
  const { data, error } = await leerTodasLasPaginas((desde, hasta) =>
    supabase
      .from("entrega_items")
      .select(
        "id, entrega_id, producto_id, lote_id, cantidad, costo_ananja_unitario_centavos, precio_sugerido_centavos, entregas_revendedor!inner(vendedor_id, tipo, fecha, created_at)",
      )
      .eq("entregas_revendedor.vendedor_id", vendedorId)
      .order("id")
      .range(desde, hasta),
  );

  if (error) {
    console.error("listarEntregaItemsFifo", error);
    return { data: [], error: "No se pudo cargar el stock por entrega." };
  }

  return {
    data: (data ?? []).map((i) => ({
      id: i.id,
      entregaId: i.entrega_id,
      tipo: i.entregas_revendedor.tipo === "devolucion" ? "devolucion" : "entrega",
      fecha: i.entregas_revendedor.fecha,
      createdAt: i.entregas_revendedor.created_at,
      productoId: i.producto_id,
      loteId: i.lote_id,
      cantidad: i.cantidad,
      costoAnanjaUnitarioCentavos: i.costo_ananja_unitario_centavos,
      precioSugeridoCentavos: i.precio_sugerido_centavos,
    })),
    error: null,
  };
}

/** Pagos informados por un vendedor, más recientes primero. Filtro
 * explícito por `vendedorId`, mismo motivo que `listarStockRevendedor`. */
export async function listarPagosRevendedor(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: PagoRevendedor[]; error: string | null }> {
  const { data, error } = await leerTodasLasPaginas((desde, hasta) =>
    supabase
      .from("pagos_revendedor")
      .select("*")
      .eq("vendedor_id", vendedorId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(desde, hasta),
  );

  if (error) {
    console.error("listarPagosRevendedor", error);
    return { data: [], error: "No se pudieron cargar los pagos." };
  }

  return { data: data ?? [], error: null };
}

/** Encargado (admin activo) del vendedor logueado, o `null` — vía RPC
 * porque la RLS de `vendedores` no le deja leer esa fila a una revendedora. */
export async function obtenerMiEncargado(
  supabase: SupabaseClient<Database>,
): Promise<{ id: string; nombre: string } | null> {
  const { data, error } = await supabase.rpc("mi_encargado_revendedor");
  if (error) {
    console.error("obtenerMiEncargado", error);
    return null;
  }
  return data?.[0] ?? null;
}

export type InformarPagoArgs = {
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  imagenPath: string | null;
  nota: string | null;
};

/** Alta de un pago informado — RPC `informar_pago_revendedor`. Devuelve el
 * `{data, error}` crudo, mismo criterio que `registrarVentaRevendedor`. */
export async function informarPagoRevendedor(
  supabase: SupabaseClient<Database>,
  args: InformarPagoArgs,
) {
  return supabase.rpc("informar_pago_revendedor", {
    p_monto_centavos: args.montoCentavos,
    p_medio_pago: args.medioPago,
    p_fecha: args.fecha,
    p_imagen_path: args.imagenPath ?? undefined,
    p_nota: args.nota ?? undefined,
  });
}

export type Revendedor = Tables<"vendedores">;
export type StockRevendedor = Tables<"v_stock_revendedor">;
export type PrecioRevendedor = Tables<"revendedor_precios">;
export type ResumenRevendedor = Tables<"v_resumen_revendedor">;
export type VentaRevendedor = Tables<"ventas_revendedor">;
export type Rendicion = Tables<"rendiciones">;
export type MedioPago = Enums<"medio_pago">;

/** Vendedor (con rol) del usuario logueado — `null` si no tiene fila o si
 * la consulta falla. Usado por `app/(mi)/layout.tsx` y `/mi` para el
 * saludo y para resolver `vendedor_id` en el cliente antes de llamar a un
 * RPC que no lo necesita como parámetro (todos los RPC de revendedor
 * resuelven `auth.uid()` server-side, esto es solo para mostrar "Hola
 * <nombre>" sin esperar la respuesta del RPC). Delega en
 * `obtenerVendedorPorUserId` (`lib/rol-vendedor.ts`) — la misma consulta
 * que usa `lib/supabase/middleware.ts` para el redirect por rol, sin
 * duplicarla. */
export async function obtenerMiRevendedor(
  supabase: SupabaseClient<Database>,
): Promise<Revendedor | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return obtenerVendedorPorUserId(supabase, user.id);
}

/**
 * Stock en poder del revendedor logueado — usado por `/mi` y
 * `/mi/ventas/nueva`. `vendedorId` (el propio, resuelto por el caller vía
 * `obtenerMiRevendedor`) se filtra EXPLÍCITAMENTE acá y no se deja
 * librado solo a la RLS: `es_admin() or vendedor_id = mi_vendedor_id()`
 * (0018_revendedores.sql) deja pasar TODAS las filas a un admin — y desde
 * 0026_roles_pendiente_espacio_revendedor.sql un admin con espacio propio
 * (`revende`) entra a `/mi` como cualquier revendedor, así que sin este
 * filtro vería el stock de todos los revendedores, no solo el suyo.
 */
export async function listarStockRevendedor(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: StockRevendedor[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_stock_revendedor")
    .select("*")
    .eq("vendedor_id", vendedorId);

  if (error) {
    console.error("listarStockRevendedor", error);
    return { data: [], error: "No se pudo cargar el stock." };
  }

  return { data: data ?? [], error: null };
}

/** Precios revendedor del revendedor logueado — usado por `/mi` y
 * `/mi/ventas/nueva`. Filtro explícito por `vendedorId`, mismo motivo que
 * `listarStockRevendedor`. */
export async function listarPreciosRevendedor(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: PrecioRevendedor[]; error: string | null }> {
  const { data, error } = await supabase
    .from("revendedor_precios")
    .select("*")
    .eq("vendedor_id", vendedorId);

  if (error) {
    console.error("listarPreciosRevendedor", error);
    return { data: [], error: "No se pudo cargar los precios." };
  }

  return { data: data ?? [], error: null };
}

/** Fila de resumen del revendedor logueado (`v_resumen_revendedor`) —
 * `null` si el usuario no tiene ventas/rol asignado todavía. Usado por
 * `/mi/ganancia`. Filtro explícito por `vendedorId`, mismo motivo que
 * `listarStockRevendedor`. */
export async function obtenerResumenRevendedor(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<ResumenRevendedor | null> {
  const { data, error } = await supabase
    .from("v_resumen_revendedor")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .maybeSingle();

  if (error) {
    console.error("obtenerResumenRevendedor", error);
    return null;
  }

  return data ?? null;
}

/** Ventas del revendedor logueado, más recientes primero — usado por
 * `/mi/ventas`. Filtro explícito por `vendedorId`, mismo motivo que
 * `listarStockRevendedor`. */
export async function listarVentasRevendedor(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: VentaRevendedor[]; error: string | null }> {
  // Paginado: el stock por entrega (FIFO) descuenta TODAS las ventas.
  const { data, error } = await leerTodasLasPaginas((desde, hasta) =>
    supabase
      .from("ventas_revendedor")
      .select("*")
      .eq("vendedor_id", vendedorId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(desde, hasta),
  );

  if (error) {
    console.error("listarVentasRevendedor", error);
    return { data: [], error: "No se pudo cargar la lista de ventas." };
  }

  return { data: data ?? [], error: null };
}

/** Rendiciones recibidas del revendedor logueado, más recientes primero —
 * usado por `/mi/ganancia`. Filtro explícito por `vendedorId`, mismo
 * motivo que `listarStockRevendedor`. */
export async function listarRendicionesRevendedor(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: Rendicion[]; error: string | null }> {
  const { data, error } = await supabase
    .from("rendiciones")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listarRendicionesRevendedor", error);
    return { data: [], error: "No se pudo cargar la lista de rendiciones." };
  }

  return { data: data ?? [], error: null };
}

export type RegistrarVentaRevendedorArgs = {
  productoId: string;
  cantidad: number;
  precioVentaCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  nota: string | null;
};

/** Alta de una venta — RPC `registrar_venta_revendedor` (el propio
 * revendedor, sin `p_vendedor_id`: se resuelve por `auth.uid()`). Devuelve
 * el `{data, error}` crudo de supabase-js, igual que `crearVersionPrecio`
 * de `lib/precios.ts`, para que el caller traduzca el error. */
export async function registrarVentaRevendedor(
  supabase: SupabaseClient<Database>,
  args: RegistrarVentaRevendedorArgs,
) {
  return supabase.rpc("registrar_venta_revendedor", {
    p_producto_id: args.productoId,
    p_cantidad: args.cantidad,
    p_precio_venta_centavos: args.precioVentaCentavos,
    p_medio_pago: args.medioPago,
    p_fecha: args.fecha,
    p_nota: args.nota ?? undefined,
  });
}

export type RegistrarVentaAdminArgs = {
  vendedorId: string;
  productoId: string;
  cantidad: number;
  fecha: string;
  /** `null` = no se sabe a cuánto se vendió. */
  precioVentaCentavos: number | null;
  medioPago: MedioPago | null;
  nota: string | null;
  /** Id de la venta generado en el cliente: un reintento con el mismo id no
   * la duplica (el RPC devuelve la ya guardada). */
  grupoId: string;
};

/** Venta cargada por un admin en nombre de una revendedora — RPC
 * `registrar_venta_revendedor_admin` (0040). Mismo reparto FIFO que
 * `registrarVentaRevendedor`. */
export async function registrarVentaRevendedorAdmin(
  supabase: SupabaseClient<Database>,
  args: RegistrarVentaAdminArgs,
) {
  return supabase.rpc("registrar_venta_revendedor_admin", {
    p_vendedor_id: args.vendedorId,
    p_producto_id: args.productoId,
    p_cantidad: args.cantidad,
    p_fecha: args.fecha,
    p_precio_venta_centavos: args.precioVentaCentavos ?? undefined,
    p_medio_pago: args.medioPago ?? undefined,
    p_nota: args.nota ?? undefined,
    p_grupo_id: args.grupoId,
  });
}

/** Completa a cuánto se vendió una venta (todas las filas del grupo) y, si
 * se pasa, el medio de pago que faltaba — RPC `fijar_precio_venta_revendedor`
 * (admin o la revendedora dueña). */
export async function fijarPrecioVentaRevendedor(
  supabase: SupabaseClient<Database>,
  grupoId: string,
  precioVentaCentavos: number,
  medioPago: MedioPago | null = null,
) {
  return supabase.rpc("fijar_precio_venta_revendedor", {
    p_grupo_id: grupoId,
    p_precio_venta_centavos: precioVentaCentavos,
    p_medio_pago: medioPago ?? undefined,
  });
}

export type RegistrarCargaArgs = {
  vendedorId: string;
  /** Uuid generado UNA vez por formulario: un reintento con la misma clave
   * (y el mismo pedido) devuelve lo ya guardado en vez de duplicarlo. */
  clave: string;
  pedido: PedidoCarga;
};

/** "Cargar todo junto" (solo admins): entrega + ventas + pago de una
 * revendedora en una sola transacción — RPC `registrar_carga_revendedor`
 * (0043). Devuelve el `{data, error}` crudo; el error se traduce con
 * `traducirErrorCarga` (`lib/carga-revendedor.ts`). */
export async function registrarCargaRevendedor(
  supabase: SupabaseClient<Database>,
  args: RegistrarCargaArgs,
) {
  return supabase.rpc("registrar_carga_revendedor", {
    p_vendedor_id: args.vendedorId,
    p_entrega: args.pedido.p_entrega,
    p_ventas: args.pedido.p_ventas,
    p_pago: args.pedido.p_pago,
    p_clave: args.clave,
  });
}

/**
 * Cargas ya guardadas muy parecidas a lo que se está por guardar — RPC
 * `buscar_cargas_parecidas` (0045 § 2). Es solo un aviso: si la búsqueda
 * falla (sin conexión, migración todavía sin aplicar) devuelve `[]` y la
 * pantalla guarda como siempre.
 */
export async function buscarCargasParecidas(
  supabase: SupabaseClient<Database>,
  args: { vendedorId: string; busqueda: BusquedaParecidas; clave?: string },
): Promise<CargaParecida[]> {
  const { data, error } = await supabase.rpc(
    "buscar_cargas_parecidas",
    parametrosBusquedaParecidas(args.vendedorId, args.busqueda, args.clave),
  );
  if (error) {
    console.error("buscarCargasParecidas", error);
    return [];
  }
  return leerCargasParecidas(data);
}

/** Baja de una venta propia — RPC `eliminar_venta_revendedor`. */
export async function eliminarVentaRevendedor(
  supabase: SupabaseClient<Database>,
  ventaId: string,
) {
  return supabase.rpc("eliminar_venta_revendedor", { p_venta_id: ventaId });
}
