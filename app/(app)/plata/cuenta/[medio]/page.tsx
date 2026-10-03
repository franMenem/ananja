import { notFound, redirect } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { AjustarSaldoButton } from "@/components/caja/ajustar-saldo-button";
import { ListaMovimientos } from "@/components/caja/lista-movimientos";
import { esMedioPagoValido, MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { cargarMovimientosPlata, obtenerCajaSaldoInicial, obtenerSaldoCuentaMedio } from "@/lib/data/plata";
import { formatCentavos } from "@/lib/money";
import { montoEnCuenta, type MedioCuenta } from "@/lib/dominio/movimientos-plata";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Tope de filas por tipo de movimiento en el historial de una cuenta. */
const LIMITE_POR_TIPO = 200;

/**
 * Historial de Mercado Pago o Banco (Cuenta Ananja) — antes `/caja/[medio]`,
 * fundido en `/plata` (2026-09-16: /caja se fundió en /plata para que la
 * plata y las deudas estén en un solo lugar). La lista muestra exactamente
 * lo que suma o resta a `v_saldos_caja` de ese medio (reglas en
 * `lib/movimientos-plata.ts`): un pago de revendedora que
 * quedó en manos de su encargado NO aparece acá aunque se lo hayan pasado
 * por Mercado Pago — aparece en el detalle de esa persona
 * (`/plata/en-manos/[id]`). Lo que pasa a la cuenta desde la mano de
 * alguien entra como "X pasó a la cuenta".
 *
 * "Efectivo" ya no es una caja: es la plata en manos de personas, que se
 * ve en /plata. `/plata/cuenta/efectivo` redirige ahí.
 */
export default async function CuentaMedioPage({ params }: PageProps<"/plata/cuenta/[medio]">) {
  const { medio } = await params;
  if (!esMedioPagoValido(medio)) notFound();
  if (medio === "efectivo") redirect("/plata");

  const medioCuenta: MedioCuenta = medio;
  const label = MEDIO_PAGO_LABELS[medioCuenta];
  const supabase = await createClient();

  const [saldoRow, caja, filas] = await Promise.all([
    obtenerSaldoCuentaMedio(supabase, medioCuenta),
    obtenerCajaSaldoInicial(supabase, medioCuenta),
    cargarMovimientosPlata(supabase, { tipo: "cuenta", medio: medioCuenta, limite: LIMITE_POR_TIPO }),
  ]);

  const saldoCentavos = saldoRow?.saldo_centavos ?? 0;
  const items = filas.map((fila) => ({
    fila,
    montoCentavos: montoEnCuenta(fila.mov, medioCuenta) ?? 0,
  }));

  return (
    <FormPage title={label} backHref="/plata" backLabel="Volver a Plata" maxWidth={760} pb>
      <div>
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Saldo en {label} · Cuenta {NEGOCIO.nombre}
        </span>
        <p
          className={`font-display text-[40px] leading-[1] tabular-nums ${
            saldoCentavos < 0 ? "text-accent" : "text-primary"
          }`}
        >
          {formatCentavos(saldoCentavos)}
        </p>
        <p className="mt-1.5 text-[12px] text-text-muted">
          Saldo inicial{" "}
          <span className="text-text tabular-nums">
            {formatCentavos(caja?.saldo_inicial_centavos ?? 0)}
          </span>
        </p>
      </div>

      <p className="text-[12px] text-text-muted">
        Lo que quedó en manos de alguien no aparece acá.
      </p>

      <AjustarSaldoButton
        medioInicial={medioCuenta}
        className="flex min-h-12 items-center justify-center border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase"
      />

      <div className="flex items-center gap-2.5 pt-2">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Movimientos
        </span>
        <span
          className="h-px flex-1"
          style={{ background: "linear-gradient(to right, var(--color-border), transparent)" }}
        />
      </div>

      <ListaMovimientos items={items} vacio={`Todavía no hay movimientos en ${label}.`} />
    </FormPage>
  );
}
