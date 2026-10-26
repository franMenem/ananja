import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

/**
 * Tarjeta héroe de la ficha de una revendedora: "Le debe a Ananja" con el
 * número grande. Rojo solo si debe algo; con 0 el número es normal y va con
 * "Al día". Si hay un pago informado sin confirmar, se avisa en azul.
 */
export function HeroeRevendedora({
  debeCentavos,
  pendienteCentavos,
  rendidoCentavos,
}: {
  debeCentavos: number;
  pendienteCentavos: number;
  rendidoCentavos: number;
}) {
  const debe = debeCentavos > 0;
  return (
    <Tarjeta como="section" aria-label={`Cuánto debe a ${NEGOCIO.nombre}`} className="flex flex-col gap-3">
      <NumeroGrande etiqueta={`Le debe a ${NEGOCIO.nombre}`} tono={debe ? "debe" : undefined}>
        {formatCentavos(Math.max(debeCentavos, 0))}
      </NumeroGrande>
      {(!debe || pendienteCentavos > 0) && (
        <div className="flex flex-wrap gap-2">
          {!debe && <Pastilla variante="ok">Al día</Pastilla>}
          {pendienteCentavos > 0 && (
            <Pastilla variante="confirmar">{formatCentavos(pendienteCentavos)} por confirmar</Pastilla>
          )}
        </div>
      )}
      {debeCentavos < 0 && (
        <p className="text-[14px] text-text-muted">Tiene {formatCentavos(-debeCentavos)} a favor.</p>
      )}
      {rendidoCentavos > 0 && (
        <p className="text-[14px] text-text-muted">Ya pagó {formatCentavos(rendidoCentavos)}</p>
      )}
    </Tarjeta>
  );
}
