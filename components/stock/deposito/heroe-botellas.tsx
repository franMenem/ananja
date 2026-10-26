import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
import { porcentajeDeposito, type TotalBotellas } from "@/lib/dominio/botellas";
import { envase } from "@/lib/negocio";

/**
 * Héroe de "Botellas": el total (depósito + en manos de revendedoras) y una
 * barra partida que muestra cómo se reparte. Si no se pudo leer lo que tienen
 * las revendedoras (`revendedoras === null`) se muestra solo el depósito.
 */
export function HeroeBotellas({
  deposito,
  revendedoras,
}: {
  deposito: number;
  /** `null`: no se pudo leer. */
  revendedoras: number | null;
}) {
  if (revendedoras === null) {
    return (
      <Tarjeta como="section" aria-label="Botellas en el depósito" className="flex flex-col gap-3">
        <NumeroGrande etiqueta="Botellas en el depósito">{deposito}</NumeroGrande>
        <p className="text-[14px] text-text-muted">No pudimos ver cuántas tienen las revendedoras.</p>
      </Tarjeta>
    );
  }

  const total: TotalBotellas = { deposito, revendedoras, total: deposito + revendedoras };
  const pct = porcentajeDeposito(total);
  return (
    <Tarjeta como="section" aria-label="Botellas en total" className="flex flex-col gap-4">
      <NumeroGrande etiqueta={`${envase(total.total)[0].toLocaleUpperCase("es-AR")}${envase(total.total).slice(1)} en total`}>
        {total.total}
      </NumeroGrande>
      <div
        role="img"
        aria-label={`${deposito} en el depósito y ${revendedoras} en revendedoras`}
        className="h-3 w-full overflow-hidden rounded-full bg-[#D0CEC8]"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[14px] text-text-muted">
        {deposito} en el depósito · {revendedoras} en revendedoras
      </p>
    </Tarjeta>
  );
}
