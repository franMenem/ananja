/**
 * Feria vista por la revendedora: arma lo que muestran `/mi/feria` y
 * `/mi/feria/cerrar` a partir de `feriaAbiertaDe` (lib/data/ferias.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeriaMiDatos } from "@/components/mi/feria-vista";
import { feriaAbiertaDe } from "@/lib/data/ferias";
import type { Database } from "@/lib/types";
import { participacionCerrada } from "@/lib/dominio/feria-admin";

export type FeriaMiCargada = { feriaId: string; datos: FeriaMiDatos };

export async function cargarFeriaMi(
  supabase: SupabaseClient<Database>,
  vendedorId: string,
): Promise<{ data: FeriaMiCargada | null; error: string | null }> {
  const { data, error } = await feriaAbiertaDe(supabase, vendedorId);
  if (error) return { data: null, error };
  if (!data || !data.participante) return { data: null, error: null };

  const p = data.participante;
  return {
    data: {
      feriaId: data.feria.id,
      datos: {
        nombre: data.feria.nombre,
        fecha: data.feria.fecha,
        lugar: data.feria.lugar,
        cerrada: participacionCerrada(p.estado),
        productos: data.productos
          .filter((f): f is typeof f & { producto_id: string } => f.producto_id !== null)
          .map((f) => ({
            productoId: f.producto_id,
            nombre: f.producto_nombre ?? "Producto",
            entregadas: Number(f.entregadas ?? 0),
            vendidas: Number(f.vendidas ?? 0),
            devueltas: Number(f.devueltas ?? 0),
            degustadas: Number(f.degustadas ?? 0),
            degustadasCarga: Number(f.degustadas_carga ?? 0),
            degustadasCierre: Number(f.degustadas_cierre ?? 0),
            precioFeriaCentavos: f.precio_feria_centavos,
          })),
        totalVendidoCentavos: Number(p.total_vendido_centavos ?? 0),
        efectivoCentavos: Number(p.efectivo_centavos ?? 0),
        mercadoPagoCentavos: Number(p.mercado_pago_centavos ?? 0),
        bancoCentavos: Number(p.banco_centavos ?? 0),
      },
    },
    error: null,
  };
}
