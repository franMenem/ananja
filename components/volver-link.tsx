import Link from "next/link";

type VolverLinkProps = {
  href: string;
  /** Texto después de "Volver a " (o "Volver al "), p.ej. "clientes" en
   * "← Volver a clientes". Se pasa completo para cubrir tanto "a" como "al". */
  label: string;
  /** El shell `(mi)` no lleva estado hover en este link (ver
   * `components/mi-header.tsx`); el resto de las páginas de detalle sí. */
  hover?: boolean;
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
export function VolverLink({ href, label, hover = true }: VolverLinkProps) {
  return (
    <Link
      href={href}
      className={`w-fit text-[11px] tracking-[0.14em] text-text-muted uppercase${hover ? " hover:text-primary-hover" : ""}`}
    >
      ← Volver a {label}
    </Link>
  );
}
