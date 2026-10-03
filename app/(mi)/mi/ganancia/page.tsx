import { MiGananciaVista } from "@/components/mi/ganancia-vista";
import { obtenerDeudaVendedor } from "@/lib/data/revendedores";
import { calcularDeudaConPendientes, historialPagos } from "@/lib/dominio/pagos-revendedor";
import { pagoComoHistorial } from "@/lib/dominio/revendedores";
import {
  listarPagosRevendedor,
  listarRendicionesRevendedor,
  listarVentasRevendedor,
} from "@/lib/revendedores";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/ganancia` — "Tu ganancia" completa (total, gráfico y por mes, ver
 * `GananciaRevendedor`) más lo que le debe a Ananja y todos sus pagos con su
 * estado (pendiente de confirmar / confirmado / rechazado), incluidas las
 * rendiciones que un admin cargó directo. La vista está en
 * `components/mi/ganancia-vista.tsx`.
 */
export default async function MiGananciaPage() {
  const supabase = await createClient();
  const { vendedor: revendedor } = await sesionActual();

  // `app/(mi)/layout.tsx` ya garantiza acceso — `revendedor` nunca
  // debería ser `null` acá, pero se cubre igual (todo en 0) en vez de
  // asumirlo con `!`.
  const vacio = Promise.resolve({ data: [], error: null });
  const [{ data: ventas }, { data: pagos }, { data: rendiciones }, deuda] = await Promise.all([
    revendedor ? listarVentasRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? listarPagosRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? listarRendicionesRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? obtenerDeudaVendedor(supabase, revendedor.id) : Promise.resolve(null),
  ]);

  const historial = pagos.map(pagoComoHistorial);
  const resumenDeuda = calcularDeudaConPendientes(
    deuda ?? 0,
    historial.map((p) => ({ montoCentavos: p.montoCentavos, estado: p.estado })),
  );
  const movimientos = historialPagos(
    historial,
    rendiciones.map((r) => ({
      id: r.id,
      montoCentavos: r.monto_centavos,
      medioPago: r.medio_pago,
      fecha: r.fecha,
      createdAt: r.created_at,
    })),
  );

  return (
    <MiGananciaVista
      ventas={ventas.map((v) => ({
        fecha: v.fecha,
        cantidad: v.cantidad,
        precioVentaCentavos: v.precio_venta_centavos,
        precioCostoCentavos: v.precio_costo_centavos,
      }))}
      debeCentavos={resumenDeuda.debeCentavos}
      pendienteCentavos={resumenDeuda.pendienteCentavos}
      movimientos={movimientos}
    />
  );
}
