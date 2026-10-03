import { IconCashBox, IconGanancia, IconMaterial, IconStock } from "@/components/icons";
import type { IconComponent } from "@/lib/navegacion";

export type TabMi = { href: string; label: string; Icon: IconComponent };

/**
 * Navegación del espacio de revendedor (`app/(mi)`) — única fuente de verdad
 * para la tab bar móvil (`components/mi-tab-bar.tsx`) y el rail de
 * escritorio (`components/mi-rail.tsx`), igual que `lib/navegacion.ts` para
 * el shell de admin.
 */
export const TABS_MI: readonly TabMi[] = [
  { href: "/mi", label: "Mi stock", Icon: IconStock },
  { href: "/mi/ventas", label: "Ventas", Icon: IconCashBox },
  { href: "/mi/ganancia", label: "Ganancia", Icon: IconGanancia },
  { href: "/mi/material", label: "Material", Icon: IconMaterial },
];

/** Un coordinador (0055_coordinador.sql) tiene una sola pantalla — sin
 * stock propio, ventas, ganancia ni material — así que no hay nada que
 * navegar: sin tabs, el rail/tab bar quedan solo con marca y "Cerrar
 * sesión" (ver `components/mi-rail.tsx`/`components/mi-tab-bar.tsx`). */
export const TABS_MI_COORDINADOR: readonly TabMi[] = [];

/** Tabs según el rol — única fuente de verdad que usan el rail y la tab
 * bar para decidir qué mostrar. */
export function tabsParaRol(rol: string | undefined): readonly TabMi[] {
  return rol === "coordinador" ? TABS_MI_COORDINADOR : TABS_MI;
}

function coincide(pathname: string, href: string): boolean {
  if (href === "/mi") return pathname === "/mi";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** `href` del ítem activo para `pathname` (el prefijo más largo) dentro de
 * `tabs`, o `null`. */
export function tabActivaMi(pathname: string, tabs: readonly TabMi[] = TABS_MI): string | null {
  const coincidencias = tabs.filter((tab) => coincide(pathname, tab.href)).sort(
    (a, b) => b.href.length - a.href.length,
  );
  return coincidencias[0]?.href ?? null;
}
