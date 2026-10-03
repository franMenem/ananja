/**
 * Lecturas de los pagos que informan las revendedoras (`pagos_revendedor`,
 * 0040_revendedores_pagos_precios.sql) — capa `lib/data` (convención en
 * `lib/data/README.md`). Solo lectura: confirmar/rechazar un pago es el RPC
 * de `/tareas/pagos/[id]`. Nada de JSX ni reglas acá: el armado de la fila
 * de presentación y el filtro por estado viven en
 * `lib/dominio/pagos-revendedor.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PagoRevendedorFuente } from "@/lib/dominio/pagos-revendedor";
import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

// `pagos_revendedor` tiene tres FK hacia `vendedores` (quién pagó, a quién,
// quién resolvió): sin la FK nombrada PostgREST tira PGRST201 (misma lección
// que `lib/data/README.md` § Qué va acá, `supabase/migrations/0049`).
const COLUMNAS_PAGO_LISTA =
  "id, monto_centavos, medio_pago, fecha, created_at, nota, estado, resuelto_en, motivo_rechazo, imagen_path, destinatario_id, " +
  "vendedor:vendedores!pagos_revendedor_vendedor_id_fkey(nombre), " +
  "destinatario:vendedores!pagos_revendedor_destinatario_id_fkey(nombre), " +
  "resolvio:vendedores!pagos_revendedor_resuelto_por_fkey(nombre)";

/**
 * Todos los pagos informados por revendedoras (de cualquier estado), más
 * recientes primero — usado por la pestaña "Pagos de revendedores" de
 * `/comprobantes`. Solo un admin ve todos (RLS).
 */
export async function listarPagosRevendedor(
  supabase: Supa,
): Promise<{ data: PagoRevendedorFuente[]; error: string | null }> {
  const { data, error } = await supabase
    .from("pagos_revendedor")
    .select(COLUMNAS_PAGO_LISTA)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listarPagosRevendedor", error);
    return { data: [], error: "No se pudo cargar la lista de pagos de revendedores." };
  }
  // Un `select` armado con una constante concatenada deja de inferirse
  // columna a columna — el cast queda encerrado acá (mismo criterio que
  // `lib/data/comprobantes.ts`).
  return { data: (data ?? []) as unknown as PagoRevendedorFuente[], error: null };
}
