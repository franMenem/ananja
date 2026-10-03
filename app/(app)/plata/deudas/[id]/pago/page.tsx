import { notFound } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { PagoDeudaForm } from "@/components/deudas/pago-deuda-form";
import { obtenerSaldoDeuda } from "@/lib/data/plata";
import { obtenerVersionVigente } from "@/lib/precios";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Formulario de pago de una deuda (ver `supabase/migrations/0027_pagos_deuda.sql`):
 * mismo criterio que `/comprobantes/[id]/cobro` — la ruta 404 si la deuda no
 * existe o ya no admite pagos (saldada o sin restante). El dólar vigente
 * (para prefijar "Pesos que salen de la caja" en una deuda USD) es el mismo
 * que usa el bloque "Ananja debe" de Plata (`obtenerVersionVigente`); si
 * falla o no hay ninguna versión cargada, el formulario simplemente no
 * prefija ese campo y el usuario lo completa a mano.
 */
export default async function PagoDeudaPage({
  params,
}: PageProps<"/plata/deudas/[id]/pago">) {
  const { id } = await params;
  const supabase = await createClient();

  const [saldo, vigente] = await Promise.all([
    obtenerSaldoDeuda(supabase, id),
    obtenerVersionVigente(supabase).catch((e) => {
      console.error("obtenerVersionVigente (pago de deuda)", e);
      return null;
    }),
  ]);

  if (
    !saldo ||
    saldo.restante_centavos === null ||
    saldo.restante_centavos <= 0 ||
    saldo.saldada_en !== null
  ) {
    notFound();
  }

  const moneda = (saldo.moneda === "USD" ? "USD" : "ARS") as "USD" | "ARS";

  return (
    <FormPage title="Registrar pago" backHref="/plata/deudas" backLabel="Volver a deudas">
      <p className="text-sm text-text-muted">{saldo.descripcion}</p>

      <PagoDeudaForm
        deudaId={id}
        moneda={moneda}
        restanteCentavos={saldo.restante_centavos}
        dolarCentavos={vigente?.version.dolar_centavos ?? null}
      />
    </FormPage>
  );
}
