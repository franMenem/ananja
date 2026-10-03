import { MisVentasVista, type MesVentasMi, type VentaAgrupadaMi } from "@/components/mi/ventas-vista";
import { listarProductosPublicos } from "@/lib/data/mi";
import { listarVentasRevendedor } from "@/lib/revendedores";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/ventas` — listado de ventas propias agrupadas por mes, más reciente
 * primero. `listarVentasRevendedor` ya devuelve las filas
 * ordenadas por fecha descendente, así que agrupar conservando el orden de
 * inserción alcanza — no hace falta reordenar. Las filas con el mismo
 * `grupo_id` (una venta que salió de dos entregas, ver
 * 0040_revendedores_pagos_precios.sql § 2) se muestran juntas. La vista
 * está en `components/mi/ventas-vista.tsx`.
 */
export default async function MisVentasPage() {
  const supabase = await createClient();
  const { vendedor: revendedor } = await sesionActual();

  // `app/(mi)/layout.tsx` ya garantiza acceso — `revendedor` nunca
  // debería ser `null` acá, pero se cubre igual (lista vacía) en vez de
  // asumirlo con `!`.
  const [{ data: ventas }, { data: productos }] = await Promise.all([
    revendedor
      ? listarVentasRevendedor(supabase, revendedor.id)
      : Promise.resolve({ data: [], error: null }),
    listarProductosPublicos(supabase),
  ]);

  const nombrePorProducto = new Map((productos ?? []).map((p) => [p.id, p.nombre]));

  const porGrupo = new Map<string, VentaAgrupadaMi>();
  for (const v of ventas) {
    const existente = porGrupo.get(v.grupo_id);
    const totalFila =
      v.precio_venta_centavos !== null ? v.cantidad * v.precio_venta_centavos : null;
    if (existente) {
      existente.cantidad += v.cantidad;
      existente.totalCentavos =
        existente.totalCentavos !== null && totalFila !== null
          ? existente.totalCentavos + totalFila
          : null;
    } else {
      porGrupo.set(v.grupo_id, {
        id: v.id,
        fecha: v.fecha,
        productoNombre: nombrePorProducto.get(v.producto_id) ?? "?",
        cantidad: v.cantidad,
        totalCentavos: totalFila,
        medioPago: v.medio_pago,
      });
    }
  }

  const meses: MesVentasMi[] = [];
  for (const v of porGrupo.values()) {
    const periodo = v.fecha.slice(0, 7);
    const mes = meses.find((m) => m.periodo === periodo);
    if (mes) {
      mes.ventas.push(v);
    } else {
      meses.push({ periodo, ventas: [v] });
    }
  }

  return <MisVentasVista meses={meses} />;
}
