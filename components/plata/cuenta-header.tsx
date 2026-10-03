import Link from "next/link";

import { CifraHeroica } from "@/components/plata/cifra-heroica";
import { formatCentavos } from "@/lib/money";
import type { MedioCuenta } from "@/lib/dominio/movimientos-plata";
import { NEGOCIO } from "@/lib/negocio";

/**
 * Bloque oliva de `/plata` (bloque 1) — dos cifras: Cuenta Ananja
 * (`v_cuenta_ananja`, con link al historial de cada medio en
 * `/plata/cuenta/[medio]`) y En manos de (`v_plata_en_manos`). Sin un
 * tercer "Total combinado": confunde más de lo que aclara.
 *
 * Variante `compacto` (2026-09-16): para el bloque "Plata" de Inicio, que
 * necesita el mismo par de cifras pero como una tarjeta más adentro de un
 * `Bloque` (sin el sangrado a los bordes de la página ni los links por
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
      <div className="flex flex-col gap-4 bg-primary px-5 pt-4 pb-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] tracking-[0.22em] text-on-primary-muted uppercase">
            Cuenta {NEGOCIO.nombre}
          </span>
          <span className="font-display text-[clamp(2rem,1.6rem+2cqw,3rem)] leading-none break-words text-background tabular-nums">
            <CifraHeroica centavos={cuentaTotal} />
          </span>
          <span className="text-[12px] text-on-primary-muted tabular-nums">
            Mercado Pago {formatCentavos(saldoCuenta.mercado_pago)} · Banco {formatCentavos(saldoCuenta.banco)}
          </span>
        </div>
        <div className="flex flex-col border-t border-primary-line pt-3">
          <span className="text-[10px] tracking-[0.22em] text-on-primary-muted uppercase">En manos de</span>
          <span className="font-display text-[20px] text-background tabular-nums">
            {formatCentavos(totalEnManos)}
          </span>
          <span className="pt-0.5 text-[12px] break-words text-on-primary-muted">
            {nombresEnManos && nombresEnManos.length > 0
              ? nombresEnManos.join(", ")
              : "Nadie tiene plata en mano."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-4 flex flex-col gap-4 bg-primary px-5 pt-[14px] pb-5 lg:-mx-[var(--page-px)] lg:-mt-[34px] lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-6 lg:gap-y-3 lg:px-[var(--page-px)] lg:pt-[26px] lg:pb-[22px]">
      <div className="min-w-0">
        <span className="text-[10px] tracking-[0.22em] text-on-primary-muted uppercase">
          Cuenta {NEGOCIO.nombre}
        </span>
        <p className="font-display text-[46px] leading-[1] text-background md:text-[44px] lg:text-[58px]">
          <CifraHeroica centavos={cuentaTotal} />
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-on-primary-muted tabular-nums">
          <Link
            href="/plata/cuenta/mercado_pago"
            className="inline-flex min-h-11 items-center underline decoration-primary-line underline-offset-2 hover:text-background"
          >
            Mercado Pago {formatCentavos(saldoCuenta.mercado_pago)}
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/plata/cuenta/banco"
            className="inline-flex min-h-11 items-center underline decoration-primary-line underline-offset-2 hover:text-background"
          >
            Banco {formatCentavos(saldoCuenta.banco)}
          </Link>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-2 border-t border-primary-line pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
        <div className="flex flex-col">
          <span className="text-[10px] tracking-[0.14em] whitespace-nowrap text-on-primary-muted uppercase">
            En manos de
          </span>
          <span className="font-display text-[20px] text-background tabular-nums lg:text-[24px]">
            {formatCentavos(totalEnManos)}
          </span>
        </div>
      </div>
    </div>
  );
}
