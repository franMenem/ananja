import Link from "next/link";

type VolverLinkProps = {
  href: string;
  /** Texto después de "Volver a " (o "Volver al "), p.ej. "clientes" en
   * "← Volver a clientes". Se pasa completo para cubrir tanto "a" como "al". */
  label: string;
  /** El shell `(mi)` no lleva estado hover en este link (ver
   * `components/mi-header.tsx`); el resto de las páginas de detalle sí. */
  hover?: boolean;
  /** Rediseño: muestra "‹ Revendedores" en vez de "← Volver a revendedores". */
  corto?: boolean;
};

/**
 * Link "← Volver a X" de las páginas de detalle — antes duplicado en
 * precios/[id], stock/insumos/[id], revendedores/[id],
 * comprobantes/[id], clientes/[id], material/[id], mi/material/[id],
 * mi/ventas/[id] y caja/deudas (ver reporte de limpieza). No reemplaza el
 * patrón `SetFormHeader` + link ícono (`←` solo, con `aria-label`) de las
 * páginas de formulario (p.ej. stock/lotes/[id], gastos/[id]) — ese es un
 * componente visual distinto.
 */
export function VolverLink({ href, label, hover = true, corto = false }: VolverLinkProps) {
  return (
    <Link
      prefetch={false}
      href={href}
      className={`inline-flex min-h-11 w-fit items-center text-[15px] text-text-muted ${hover ? " hover:text-primary-hover" : ""}`}
    >
      {corto ? `‹ ${label.charAt(0).toLocaleUpperCase("es-AR")}${label.slice(1)}` : `← Volver a ${label}`}
    </Link>
  );
}
