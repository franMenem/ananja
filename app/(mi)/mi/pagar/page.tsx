import { PagoForm } from "@/components/mi/pago-form";
import { TituloFormularioEscritorio } from "@/components/mi/titulo-formulario";
import { obtenerDeudaVendedor } from "@/lib/data/revendedores";
import { calcularDeudaConPendientes, pagoEstado } from "@/lib/dominio/pagos-revendedor";
import { listarPagosRevendedor, obtenerMiEncargado } from "@/lib/revendedores";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/pagar` — "Pagar a {encargado}" / "Pagar a Ananja"
 * (0040_revendedores_pagos_precios.sql § 3): precarga el monto con lo que
 * debe menos lo que ya informó y espera confirmación.
 */
export default async function PagarPage() {
  const supabase = await createClient();
  const { vendedor: revendedor } = await sesionActual();

  const [deuda, { data: pagos }, encargado] = await Promise.all([
    revendedor ? obtenerDeudaVendedor(supabase, revendedor.id) : Promise.resolve(null),
    revendedor
      ? listarPagosRevendedor(supabase, revendedor.id)
      : Promise.resolve({ data: [], error: null }),
    revendedor ? obtenerMiEncargado(supabase) : Promise.resolve(null),
  ]);

  const resumen = calcularDeudaConPendientes(
    deuda ?? 0,
    pagos.map((p) => ({ montoCentavos: p.monto_centavos, estado: pagoEstado(p.estado) })),
  );

  if (!revendedor) {
    return <p className="text-sm text-text-muted">No encontramos tu cuenta de revendedora.</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <TituloFormularioEscritorio />
      <PagoForm
        vendedorId={revendedor.id}
        encargado={encargado}
        debeCentavos={resumen.debeCentavos}
        pendienteCentavos={resumen.pendienteCentavos}
        sugeridoCentavos={resumen.aPagarSugeridoCentavos}
      />
    </div>
  );
}
