import Link from "next/link";

/**
 * Bloque 2 de la ficha (`/revendedores/[id]`, rediseño "de 10 bloques a
 * 5", 2026-09-16): dos botones — "Cargar movimiento" (entrega, ventas y
 * pago juntos, `/revendedores/[id]/carga`) y "Devolución" (solo
 * devoluciones, `/revendedores/[id]/devolucion`). Reemplazan los cuatro
 * botones de antes (Entregar / Cargar ventas / Registrar pago / "Cargar
 * todo junto").
 */
export function AccionesFicha({ vendedorId }: { vendedorId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/revendedores/${vendedorId}/carga`}
        className="flex min-h-11 flex-1 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.12em] text-background uppercase hover:bg-primary-hover sm:flex-none"
      >
        Cargar movimiento
      </Link>
      <Link
        href={`/revendedores/${vendedorId}/devolucion`}
        className="flex min-h-11 flex-1 items-center justify-center border border-primary px-4 text-[13px] font-medium tracking-[0.12em] text-primary uppercase sm:flex-none"
      >
        Devolución
      </Link>
    </div>
  );
}
