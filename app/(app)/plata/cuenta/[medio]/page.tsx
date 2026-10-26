import { notFound, redirect } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { AjustarSaldoButton } from "@/components/caja/ajustar-saldo-button";
import { ListaMovimientos } from "@/components/caja/lista-movimientos";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
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
      <p className="text-[15px] text-text-muted">¿Qué entró y qué salió de {label}?</p>

      <Tarjeta className="flex flex-col gap-3">
        <NumeroGrande etiqueta={`Saldo en ${label} · Cuenta de ${NEGOCIO.nombre}`}>
          <span className={saldoCentavos < 0 ? "text-accent" : undefined}>{formatCentavos(saldoCentavos)}</span>
        </NumeroGrande>
        <p className="text-[14px] text-text-muted">
          Saldo inicial{" "}
          <span className="text-text tabular-nums">
            {formatCentavos(caja?.saldo_inicial_centavos ?? 0)}
          </span>
          . Lo que quedó en manos de alguien no aparece acá.
        </p>
        <AjustarSaldoButton medioInicial={medioCuenta} className={`${BOTON_SECUNDARIO} flex self-start px-4`} />
      </Tarjeta>

      <Tarjeta como="section" aria-labelledby="cuenta-movimientos" className="flex flex-col gap-3">
        <h2 id="cuenta-movimientos" className="text-[20px] leading-tight font-semibold text-text">
          Movimientos
        </h2>
        <ListaMovimientos items={items} vacio={`Todavía no hay movimientos en ${label}.`} />
      </Tarjeta>
    </FormPage>
  );
}
