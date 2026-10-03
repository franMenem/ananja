/**
 * Set mínimo de íconos SVG inline (stroke, 24x24, `currentColor`) usados en
 * el header y la tab bar. Sin librerías externas.
 */

type IconProps = {
  className?: string;
};

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function IconReceipt({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  );
}

export function IconExpense({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 6v-.5A1.5 1.5 0 0 1 7.5 4H18" />
    </svg>
  );
}

export function IconCashBox({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h4" />
    </svg>
  );
}

export function IconStock({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.5 7.5 12 3l8.5 4.5-8.5 4.5-8.5-4.5Z" />
      <path d="M3.5 7.5v9L12 21l8.5-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

/**
 * Ícono del rail de escritorio agregado en el rediseño (Fase 1) para
 * pantallas posteriores al handoff — Lotes ("Pedidos" en el menú desde
 * 2026-09-16, solo cambió el label, no el ícono). Mismo lenguaje que el
 * resto: stroke, 24x24, `currentColor`.
 */
export function IconLotes({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.5 7.5 12 3l8.5 4.5-8.5 4.5-8.5-4.5Z" />
      <path d="M3.5 12l8.5 4.5 8.5-4.5" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10.5 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4.5" />
      <path d="M15.5 16 20 12l-4.5-4" />
      <path d="M20 12H10" />
    </svg>
  );
}

/** Ícono de Ganancia — línea ascendente, mismo lenguaje que el resto. */
export function IconGanancia({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.5 17.5 9.5 11l4 4 6.5-7.5" />
      <path d="M15 7h5v5" />
    </svg>
  );
}

/**
 * Ícono de Insumos — un matraz (materia prima/envases/etiquetas que se
 * combinan en un producto), mismo lenguaje que el resto (stroke, 24x24,
 * currentColor).
 */
export function IconInsumos({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v5.5L5.5 18a1.5 1.5 0 0 0 1.3 2.25h10.4A1.5 1.5 0 0 0 18.5 18l-5-9V3.5" />
      <path d="M7.8 15h8.4" />
    </svg>
  );
}

/**
 * Ícono de Revendedores — dos figuras humanas (círculo + arco, mismo
 * trazo que el resto) con una flecha entre ambas para sugerir "traspaso"
 * de stock en consignación.
 */
export function IconRevendedores({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="3" />
      <path d="M2 20c0-3 2.5-5 5-5s5 2 5 5" />
      <circle cx="17" cy="7" r="3" />
      <path d="M12 20c0-3 2.5-5 5-5s5 2 5 5" />
      <path d="M9.5 10.5l2 2-2 2" />
    </svg>
  );
}

/**
 * Ícono de Material de venta — un librito/documento abierto (contenido de
 * referencia para el revendedor), mismo lenguaje que el resto (stroke,
 * 24x24, currentColor). Reusado tal cual en `components/mi-tab-bar.tsx`.
 */
export function IconMaterial({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 6.5c-1.8-1.2-4-1.7-6-1.5v12c2 -.2 4.2.3 6 1.5" />
      <path d="M12 6.5c1.8-1.2 4-1.7 6-1.5v12c-2-.2-4.2.3-6 1.5" />
      <path d="M12 6.5v12" />
    </svg>
  );
}

/**
 * Ícono de Tareas — un checklist (rectángulo + tilde), mismo lenguaje que
 * el resto (stroke, 24x24, currentColor).
 */
export function IconTareas({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" />
      <path d="M7.5 12.5 10 15l6-6.5" />
    </svg>
  );
}

/**
 * Ícono del botón de colapsar/expandir el rail de escritorio
 * (`components/app-rail.tsx`) — un panel lateral con una división,
 * mismo lenguaje que el resto (stroke, 24x24, currentColor). El estado
 * (colapsado/expandido) se comunica con `aria-expanded` en el botón, no
 * con una variación del ícono.
 */
export function IconRailToggle({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M9.5 4v16" />
    </svg>
  );
}
