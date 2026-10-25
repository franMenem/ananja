import Link from "next/link";

import { CifraHeroica } from "@/components/plata/cifra-heroica";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
import { formatCentavos } from "@/lib/money";
import type { MedioCuenta } from "@/lib/dominio/movimientos-plata";
import { NEGOCIO } from "@/lib/negocio";

/**
 * Tarjeta de `/plata` (bloque 1) — dos cifras: Cuenta Ananja
 * (`v_cuenta_ananja`, con link al historial de cada medio en
 * `/plata/cuenta/[medio]`) y En manos de (`v_plata_en_manos`). Sin un
 * tercer "Total combinado": confunde más de lo que aclara.
 *
 * Variante `compacto` (2026-09-16): para el bloque "Plata" de Inicio, que
 * necesita el mismo par de cifras pero como una tarjeta más adentro de un
 * `Bloque` (sin los links por
 * medio) y con los nombres de quienes tienen plata en mano, que Inicio no
 * lista uno por uno.
 */
export function CuentaHeader({
  cuentaTotal,
  saldoCuenta,
  totalEnManos,
  nombresEnManos,
  compacto = false,
}: {
  cuentaTotal: number;
  saldoCuenta: Record<MedioCuenta, number>;
  totalEnManos: number;
  /** Nombres de quienes tienen plata en mano ("Vos" si soy yo) — solo se
   * usa en la variante `compacto`. */
  nombresEnManos?: string[];
  compacto?: boolean;
}) {
  if (compacto) {
    return (
      <Tarjeta className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <NumeroGrande etiqueta={`Cuenta ${NEGOCIO.nombre}`}>
            <CifraHeroica centavos={cuentaTotal} />
          </NumeroGrande>
          <span className="text-[14px] text-text-muted tabular-nums">
            Mercado Pago {formatCentavos(saldoCuenta.mercado_pago)} · Banco {formatCentavos(saldoCuenta.banco)}
          </span>
        </div>
        <div className="flex flex-col border-t border-line pt-3">
          <span className="text-[15px] text-text-muted">En manos de</span>
          <span className="font-display text-[24px] text-text">{formatCentavos(totalEnManos)}</span>
          <span className="pt-0.5 text-[14px] break-words text-text-muted">
            {nombresEnManos && nombresEnManos.length > 0
              ? nombresEnManos.join(", ")
              : "Nadie tiene plata en mano."}
          </span>
        </div>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-6 lg:gap-y-3">
      <div className="min-w-0">
        <NumeroGrande etiqueta={`Cuenta ${NEGOCIO.nombre}`}>
          <CifraHeroica centavos={cuentaTotal} />
        </NumeroGrande>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] text-text-muted tabular-nums">
          <Link
            href="/plata/cuenta/mercado_pago"
            className="inline-flex min-h-11 items-center underline decoration-mark underline-offset-2 hover:text-text"
          >
            Mercado Pago {formatCentavos(saldoCuenta.mercado_pago)}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/plata/cuenta/banco"
            className="inline-flex min-h-11 items-center underline decoration-mark underline-offset-2 hover:text-text"
          >
            Banco {formatCentavos(saldoCuenta.banco)}
          </Link>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
        <div className="flex flex-col">
          <span className="text-[15px] whitespace-nowrap text-text-muted">En manos de</span>
          <span className="font-display text-[24px] text-text">{formatCentavos(totalEnManos)}</span>
        </div>
      </div>
    </Tarjeta>
  );
}
