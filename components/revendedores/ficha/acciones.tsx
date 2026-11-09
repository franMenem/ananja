import Link from "next/link";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { LinkBoton } from "@/components/ui/link-boton";

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

const SECUNDARIO = `${BOTON_SECUNDARIO} flex px-2 text-[15px] leading-tight whitespace-nowrap`;

/**
 * Acciones de la ficha de una revendedora: "Entregar botellas" (principal,
 * ancho completo); debajo, "Registrar pago" y "Registrar venta" en dos
 * columnas (una sola si la pantalla es muy angosta, antes de partir el
 * texto) y "Devolución" como tercer nivel: un link de texto.
 */
export function AccionesFicha({ vendedorId }: { vendedorId: string }) {
  const href = hrefsAcciones(vendedorId);
  return (
    <div className="flex flex-col gap-2">
      <LinkBoton prefetch={false} href={href.entregar} className={`${BOTON_PRIMARIO} flex w-full px-4`}>
        Entregar botellas
      </LinkBoton>
      <div className="grid grid-cols-2 gap-2 max-[339px]:grid-cols-1">
        <LinkBoton prefetch={false} href={href.pago} className={SECUNDARIO}>
          Registrar pago
        </LinkBoton>
        <LinkBoton prefetch={false} href={href.venta} className={SECUNDARIO}>
          Registrar venta
        </LinkBoton>
      </div>
      <Link
        prefetch={false}
        href={href.devolucion}
        className="flex min-h-11 items-center justify-center text-[15px] font-semibold text-text-muted underline decoration-[#d0cec8] underline-offset-4 hover:text-text"
      >
        Devolución
      </Link>
    </div>
  );
}
