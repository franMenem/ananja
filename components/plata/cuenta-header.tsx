import Link from "next/link";

import { CifraHeroica } from "@/components/plata/cifra-heroica";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
import { formatCentavos } from "@/lib/money";
import type { MedioCuenta } from "@/lib/dominio/movimientos-plata";
import { NEGOCIO } from "@/lib/negocio";

/**
 * Tarjeta héroe de `/plata`: lo que hay en la cuenta de Ananja
 * (`v_cuenta_ananja`) como número grande, y debajo cuánto está en Mercado
 * Pago y cuánto en el banco, cada uno con link a su historial
 * (`/plata/cuenta/[medio]`). La plata en manos de personas va aparte
 * ("Fuera de la cuenta").
 */
export function CuentaHeader({
  cuentaTotal,
  saldoCuenta,
}: {
  cuentaTotal: number;
  saldoCuenta: Record<MedioCuenta, number>;
}) {
  return (
    <Tarjeta className="flex flex-col gap-3">
      <NumeroGrande etiqueta={`En la cuenta de ${NEGOCIO.nombre}`}>
        <CifraHeroica centavos={cuentaTotal} />
      </NumeroGrande>
      <div className="flex flex-wrap items-center gap-x-5 text-[16px] text-text-muted tabular-nums">
        <Link
          prefetch={false}
          href="/plata/cuenta/mercado_pago"
          className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:text-text"
        >
          Mercado Pago {formatCentavos(saldoCuenta.mercado_pago)}
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          prefetch={false}
          href="/plata/cuenta/banco"
          className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:text-text"
        >
          Banco {formatCentavos(saldoCuenta.banco)}
        </Link>
      </div>
    </Tarjeta>
  );
}
