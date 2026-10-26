import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { estadoDeudaHero } from "@/lib/dominio/deuda-hero";
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
  encargadoNombre = null,
}: {
  debeCentavos: number;
  pendienteCentavos: number;
  rendidoCentavos: number;
  /** Quien confirma los pagos: su encargado, o `null` si es Ananja. */
  encargadoNombre?: string | null;
}) {
  const deuda = estadoDeudaHero(debeCentavos, pendienteCentavos);
  const rojo = deuda.tipo === "debe" || deuda.tipo === "parcial";
  return (
    <Tarjeta como="section" aria-label={`Cuánto debe a ${NEGOCIO.nombre}`} className="flex flex-col gap-3">
      <NumeroGrande etiqueta={`Le debe a ${NEGOCIO.nombre}`} tono={rojo ? "debe" : undefined}>
        {formatCentavos(Math.max(debeCentavos, 0))}
      </NumeroGrande>
      {(deuda.tipo === "al-dia" || pendienteCentavos > 0) && (
        <div className="flex flex-wrap gap-2">
          {deuda.tipo === "al-dia" && <Pastilla variante="ok">Al día</Pastilla>}
          {deuda.tipo === "al-dia" && pendienteCentavos > 0 && (
            <Pastilla variante="confirmar">{formatCentavos(pendienteCentavos)} por confirmar</Pastilla>
          )}
          {deuda.tipo === "todo-pagado" && (
            <Pastilla variante="confirmar" className="max-w-full whitespace-normal! leading-snug!">
              Ya lo pagó todo, falta que {encargadoNombre ?? NEGOCIO.nombre} lo confirme
            </Pastilla>
          )}
          {deuda.tipo === "parcial" && (
            <Pastilla variante="confirmar" className="max-w-full whitespace-normal! leading-snug!">
              {formatCentavos(pendienteCentavos)} esperando que {encargadoNombre ?? NEGOCIO.nombre} lo confirme
            </Pastilla>
          )}
        </div>
      )}
      {deuda.tipo === "parcial" && (
        <p className="text-[14px] text-text-muted">Le queda pagar {formatCentavos(deuda.quedaCentavos)}</p>
      )}
      {debeCentavos < 0 && (
        <p className="text-[14px] text-text-muted">Tiene {formatCentavos(-debeCentavos)} a favor.</p>
      )}
      {rendidoCentavos > 0 && <p className="text-[14px] text-text-muted">Ya pagó {formatCentavos(rendidoCentavos)}</p>}
    </Tarjeta>
  );
}
