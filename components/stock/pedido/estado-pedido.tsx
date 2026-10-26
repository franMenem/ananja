import { Pastilla, type VariantePastilla } from "@/components/ui/pastilla";
import type { EstadoPedido } from "@/lib/dominio/pedidos-lote";

/** Color de la pastilla de cada estado: falta pagar = rojo (debe), sin costos
 * = ámbar (aviso), pagado = verde (el único estado "todo bien"). */
export const VARIANTE_ESTADO_PEDIDO: Record<EstadoPedido["tipo"], VariantePastilla> = {
  "sin-costos": "aviso",
  falta: "debe",
  pagado: "ok",
};

/** Una sola pastilla con el estado del pedido. */
export function PastillaEstadoPedido({ estado, className }: { estado: EstadoPedido; className?: string }) {
  return (
    <Pastilla variante={VARIANTE_ESTADO_PEDIDO[estado.tipo]} className={className}>
      {estado.label}
    </Pastilla>
  );
}
