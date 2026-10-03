/**
 * Lecturas de Ganancia — capa `lib/data` (convención en
 * `lib/data/README.md`). Nada de JSX ni agregación acá: eso vive en
 * `app/(app)/ganancia/page.tsx` (UI) y `lib/dominio/margen.ts`/
 * `lib/dominio/graficos.ts` (funciones puras) — esta pantalla lee
 * `v_margen_ventas` una sola vez, sin volver a repetirla (vista cara, ~90 ms
 * solo de planificación).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listarVendedoresNombre as listarVendedoresNombreCatalogo } from "@/lib/data/catalogos";
import type { ItemVendido, VentaConFecha } from "@/lib/dominio/graficos";
import type { FilaMargenVentasCruda, GastoConCategoriaCrudo } from "@/lib/dominio/margen";
import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export interface VentaRevendedor {
  fecha: string; // "YYYY-MM-DD"
  producto_id: string;
  cantidad: number;
  precio_costo_centavos: number;
}

export interface ProductoPresentacion {
  id: string;
  presentacion_ml: number;
}

export interface DatosGraficos {
  /** Comprobantes, tal cual llegan de la tabla — la página arma con esto
   * las ventas para el gráfico de líneas (junto con `ventasRevendedor`). */
  comprobantes: VentaConFecha[];
  /** Ventas de revendedor — se usan dos veces en la página: como ingreso
   * (a `precio_costo_centavos`, no `precio_venta_centavos` — ver
   * `/ganancia`) para el gráfico de líneas, y como unidades vendidas para
   * la torta. */
  ventasRevendedor: VentaRevendedor[];
  /** `comprobante_items` con la fecha ya resuelta desde `comprobantes`
   * (la tabla no tiene columna `fecha` propia — se trae con el embed de
   * Supabase `comprobantes(fecha)`, mismo mecanismo que ya usa el resto de
   * la app para traer datos relacionados en una sola query). */
  comprobanteItems: ItemVendido[];
  /** Para combinar las filas de `unidadesPorProducto` (`lib/dominio/graficos.ts`,
   * agrupadas por `producto_id`) en porciones por presentación
   * (`resumenBotellasPorPresentacion`, también en `lib/dominio/graficos.ts`). */
  productos: ProductoPresentacion[];
}

const DATOS_VACIOS: DatosGraficos = {
  comprobantes: [],
  ventasRevendedor: [],
  comprobanteItems: [],
  productos: [],
};

type ComprobanteItemRow = {
  producto_id: string;
  cantidad: number;
  comprobantes: { fecha: string } | null;
};

/** Descarta ítems cuyo comprobante no se pudo resolver por el embed (no
 * debería pasar — `comprobante_id` es `NOT NULL` en la tabla real — pero
 * el tipo generado para un embed a-uno puede salir nullable igual, mismo
 * criterio ya usado en otros lugares de esta app). Un ítem sin fecha se
 * omite en vez de romper el gráfico. */
function tieneFecha(
  item: ComprobanteItemRow,
): item is ComprobanteItemRow & { comprobantes: { fecha: string } } {
  return item.comprobantes !== null;
}

/**
 * Todo lo que necesita `/ganancia` (gráfico de líneas + resumen de botellas
 * vendidas) en una sola carga en paralelo (`Promise.all`). Errores no
 * silenciosos: si falla cualquiera de las cuatro consultas, se loguea y se
 * devuelve un mensaje para mostrar en la pantalla — nunca se completa a
 * medias.
 */
export async function cargarDatosGraficos(
  supabase: Supa,
): Promise<{ data: DatosGraficos; error: string | null }> {
  const [comprobantesRes, ventasRevendedorRes, itemsRes, productosRes] = await Promise.all([
    supabase.from("comprobantes").select("fecha, monto_centavos"),
    supabase
      .from("ventas_revendedor")
      .select("fecha, producto_id, cantidad, precio_costo_centavos"),
    supabase
      .from("comprobante_items")
      .select("producto_id, cantidad, comprobantes(fecha)")
      .returns<ComprobanteItemRow[]>(),
    supabase.from("productos").select("id, presentacion_ml"),
  ]);

  if (
    comprobantesRes.error ||
    ventasRevendedorRes.error ||
    itemsRes.error ||
    productosRes.error
  ) {
    console.error(
      "cargarDatosGraficos",
      comprobantesRes.error ?? ventasRevendedorRes.error ?? itemsRes.error ?? productosRes.error,
    );
    return { data: DATOS_VACIOS, error: "No se pudo cargar la información de ventas." };
  }

  const comprobanteItems: ItemVendido[] = (itemsRes.data ?? [])
    .filter(tieneFecha)
    .map((i) => ({
      fecha: i.comprobantes.fecha,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
    }));

  return {
    data: {
      comprobantes: comprobantesRes.data ?? [],
      ventasRevendedor: ventasRevendedorRes.data ?? [],
      comprobanteItems,
      productos: productosRes.data ?? [],
    },
    error: null,
  };
}

const COLUMNAS_MARGEN_VENTAS =
  "origen, fecha, vendedor_id, cantidad, margen_ananja_centavos, margen_vendedor_centavos, precio_unitario_venta_centavos, costo_estimado";

/** Filas de `v_margen_ventas` para toda la vida de la app — `/ganancia`
 * agrupa por mes/año en memoria (`lib/margen.ts`), no hay filtro de fecha
 * que empujar acá. */
export async function listarMargenVentas(
  supabase: Supa,
): Promise<{ data: FilaMargenVentasCruda[]; error: string | null }> {
  const { data, error } = await supabase.from("v_margen_ventas").select(COLUMNAS_MARGEN_VENTAS);
  if (error) {
    console.error("listarMargenVentas", error);
    return { data: [], error: "No se pudo cargar la información de ganancia." };
  }
  return { data: data ?? [], error: null };
}

/** Gastos con su categoría (`categorias_gasto.es_costo_produccion`) — para
 * separar los gastos OPERATIVOS de los de producción (`filtrarGastosOperativos`,
 * `lib/margen.ts`). */
export async function listarGastosConCategoria(
  supabase: Supa,
): Promise<{ data: GastoConCategoriaCrudo[]; error: string | null }> {
  const { data, error } = await supabase
    .from("gastos")
    .select("fecha, monto_centavos, categorias_gasto(es_costo_produccion)");
  if (error) {
    console.error("listarGastosConCategoria", error);
    return { data: [], error: "No se pudo cargar la información de ganancia." };
  }
  return { data: (data ?? []) as unknown as GastoConCategoriaCrudo[], error: null };
}

export interface VendedorNombre {
  id: string;
  nombre: string;
}

/** `id`/`nombre` de todos los vendedores — para mostrar el nombre en la
 * tabla de "Ganancia de los vendedores". Mismo catálogo sin filtrar que usa
 * la ficha de Lote → `lib/data/catalogos.ts`. */
export async function listarVendedoresNombre(
  supabase: Supa,
): Promise<{ data: VendedorNombre[]; error: string | null }> {
  const { data, error } = await listarVendedoresNombreCatalogo(supabase);
  if (error) return { data: [], error: "No se pudo cargar la información de ganancia." };
  return { data, error: null };
}
