import Link from "next/link";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { formatCentavos } from "@/lib/money";

/**
 * Héroe del detalle de un pedido: "Falta pagar" con el número grande (rojo
 * solo si es mayor que cero) y el botón para registrar el pago. Sin plata
 * pendiente: el número va normal y una pastilla verde dice "Pagado". Un
 * pedido sin costos todavía no sabe cuánto hay que pagar: avisa en ámbar y
 * lleva a completarlos.
 */
export function HeroePedido({
  pedidoId,
  tieneCostos,
  pendienteCentavos,
}: {
  pedidoId: string;
  tieneCostos: boolean;
  pendienteCentavos: number;
}) {
  if (!tieneCostos) {
    return (
      <Tarjeta como="section" aria-label="Estado del pedido" className="flex flex-col gap-3">
        <Pastilla variante="aviso" className="w-fit">
          Sin costos
        </Pastilla>
        <p className="text-[16px] text-text">Todavía no sabemos cuánto costó ni cuánto hay que pagar.</p>
        <Link prefetch={false} href={`/stock/lotes/${pedidoId}/costos`} className={`${BOTON_PRIMARIO} flex px-4`}>
          Completar costos
        </Link>
      </Tarjeta>
    );
  }

  const debe = pendienteCentavos > 0;
  return (
    <Tarjeta como="section" aria-label="Cuánto falta pagar" className="flex flex-col gap-4">
      <NumeroGrande etiqueta="Falta pagar" tono={debe ? "debe" : undefined}>
        {formatCentavos(Math.max(pendienteCentavos, 0))}
      </NumeroGrande>
      {debe ? (
        <Link prefetch={false} href={`/stock/lotes/${pedidoId}/pago`} className={`${BOTON_PRIMARIO} flex px-4`}>
          Registrar pago
        </Link>
      ) : (
        <Pastilla variante="ok" className="w-fit">
          Pagado
        </Pastilla>
      )}
    </Tarjeta>
  );
}
