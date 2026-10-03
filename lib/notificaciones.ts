import type { SupabaseClient } from "@supabase/supabase-js";

import type { MedioPago } from "@/lib/dominio/caja";
import { esTipoAviso, fraseDeAviso, type Aviso, type TipoAviso } from "@/lib/dominio/notificaciones";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

// Los tipos (`TipoAviso`, `Aviso`) y las funciones puras (`fraseDeAviso`,
// `grupoDeFecha`, `esTipoAviso`) viven en `lib/dominio/notificaciones.ts`.
// Este archivo se queda con la lectura.

/**
 * Últimos 10 avisos de `gasto_nuevo`/`stock_bajo` con su frase ya armada,
 * más nuevo primero — para el bloque "Avisos" de `/tareas`. No lanza: un
 * fallo acá no debe tumbar la pantalla de Tareas, solo deja el bloque
 * vacío (se loguea para diagnóstico).
 */
export async function cargarAvisos(supabase: Supa): Promise<Aviso[]> {
  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .in("tipo", ["gasto_nuevo", "stock_bajo"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data) {
    console.error("cargarAvisos", error);
    return [];
  }

  // El `.in("tipo", ...)` de arriba ya filtra en la base — este guard solo
  // estrecha el tipo de TypeScript para poder llamar `fraseDeAviso` (que
  // pide `TipoAviso`, sin `pago_revendedor`) sin un `as`.
  const filas = data.filter(
    (n): n is Tables<"notificaciones"> & { tipo: TipoAviso } => esTipoAviso(n.tipo),
  );

  const productoIds = [
    ...new Set(
      filas
        .filter((n) => n.tipo === "stock_bajo" && n.referencia_id)
        .map((n) => n.referencia_id as string),
    ),
  ];
  const gastoIds = [
    ...new Set(
      filas
        .filter((n) => n.tipo === "gasto_nuevo" && n.referencia_id)
        .map((n) => n.referencia_id as string),
    ),
  ];

  const [stockRes, gastoRes] = await Promise.all([
    productoIds.length > 0
      ? supabase
          .from("v_stock_actual")
          .select("producto_id, presentacion_ml, umbral_minimo")
          .in("producto_id", productoIds)
      : Promise.resolve({ data: [] as { producto_id: string | null; presentacion_ml: number | null; umbral_minimo: number | null }[] }),
    gastoIds.length > 0
      ? supabase
          .from("gastos")
          .select("id, monto_centavos, medio_pago, categorias_gasto(nombre), vendedores!gastos_vendedor_id_fkey(nombre)")
          .in("id", gastoIds)
      : Promise.resolve({ data: [] as { id: string; monto_centavos: number; medio_pago: MedioPago; categorias_gasto: { nombre: string } | null; vendedores: { nombre: string } | null }[] }),
  ]);

  const stockPorProducto = new Map(
    (stockRes.data ?? [])
      .filter((s): s is typeof s & { producto_id: string } => Boolean(s.producto_id))
      .map((s) => [s.producto_id, { presentacion_ml: s.presentacion_ml, umbral_minimo: s.umbral_minimo }]),
  );

  const gastoPorId = new Map(
    (gastoRes.data ?? []).map((g) => [
      g.id,
      {
        monto_centavos: g.monto_centavos,
        medio_pago: g.medio_pago,
        categoria: g.categorias_gasto?.nombre ?? null,
        vendedor: g.vendedores?.nombre ?? null,
      },
    ]),
  );

  return filas.map((n) => ({
    id: n.id,
    created_at: n.created_at,
    frase: fraseDeAviso(n, stockPorProducto, gastoPorId),
  }));
}
