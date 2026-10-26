import Link from "next/link";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";

/** Adónde lleva cada botón de la ficha. Las secciones son las del formulario
 * único `/revendedores/[id]/carga` (`?seccion=entrega|ventas|pago`). */
export function hrefsAcciones(vendedorId: string) {
  const base = `/revendedores/${vendedorId}`;
  return {
    entregar: `${base}/carga?seccion=entrega`,
    pago: `${base}/carga?seccion=pago`,
    venta: `${base}/carga?seccion=ventas`,
    devolucion: `${base}/devolucion`,
  };
}

const SECUNDARIO = `${BOTON_SECUNDARIO} flex px-2 text-[15px] leading-tight`;

/**
 * Acciones de la ficha de una revendedora: "Entregar botellas" (principal,
 * ancho completo) y debajo "Registrar pago", "Registrar venta" y "Devolución".
 */
export function AccionesFicha({ vendedorId }: { vendedorId: string }) {
  const href = hrefsAcciones(vendedorId);
  return (
    <div className="flex flex-col gap-2">
      <Link href={href.entregar} className={`${BOTON_PRIMARIO} flex w-full px-4`}>
        Entregar botellas
      </Link>
      <div className="grid grid-cols-3 gap-2">
        <Link href={href.pago} className={SECUNDARIO}>
          Registrar pago
        </Link>
        <Link href={href.venta} className={SECUNDARIO}>
          Registrar venta
        </Link>
        <Link href={href.devolucion} className={SECUNDARIO}>
          Devolución
        </Link>
      </div>
    </div>
  );
}
