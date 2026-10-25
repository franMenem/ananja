import type { ComponentType } from "react";

import {
  IconBilletera,
  IconCashBox,
  IconExpense,
  IconGanancia,
  IconHome,
  IconInsumos,
  IconLotes,
  IconMaterial,
  IconPersonas,
  IconReceipt,
  IconRevendedores,
  IconStock,
  IconTareas,
} from "@/components/icons";

/**
 * Navegación de la app — única fuente de verdad para el rail de
 * escritorio (`components/app-rail.tsx`), la tab bar móvil
 * (`components/tab-bar.tsx`), el nombre de pantalla del header móvil
 * (`components/app-header.tsx`) y los chips de secciones hermanas
 * (`components/sector-chips.tsx`).
 *
 * Rediseño 2026-10 (fase 2): cuatro lugares — Hoy, Botellas, Personas y
 * Plata. Cambia solo cómo se agrupan y cómo se llega: ninguna ruta se
 * movió ni se borró. Cargar algo nuevo se hace con el botón "+"
 * (`components/cargar/`), que no es un sector.
 *
 * Los tabs llevan directo a la primera sección del sector (ver
 * `destinoDeSector`).
 */

export type IconComponent = ComponentType<{ className?: string }>;

export interface Seccion {
  id: string;
  label: string;
  href: string;
  Icon: IconComponent;
}

export interface Sector {
  id: string;
  label: string;
  /** Raíz del sector (igual al href de su primera sección). */
  href: string;
  Icon: IconComponent;
  secciones: Seccion[];
}

export const SECTORES: readonly Sector[] = [
  {
    id: "hoy",
    label: "Hoy",
    href: "/",
    Icon: IconHome,
    secciones: [
      { id: "resumen", label: "Resumen", href: "/", Icon: IconHome },
      { id: "para-hacer", label: "Para hacer", href: "/tareas", Icon: IconTareas },
    ],
  },
  {
    id: "botellas",
    label: "Botellas",
    href: "/stock",
    Icon: IconStock,
    secciones: [
      { id: "deposito", label: "Depósito", href: "/stock", Icon: IconStock },
      { id: "pedidos", label: "Pedidos", href: "/stock/lotes", Icon: IconLotes },
      { id: "insumos", label: "Insumos", href: "/stock/insumos", Icon: IconInsumos },
    ],
  },
  {
    id: "personas",
    label: "Personas",
    href: "/revendedores",
    Icon: IconPersonas,
    secciones: [
      {
        id: "revendedores",
        label: "Revendedores",
        href: "/revendedores",
        Icon: IconRevendedores,
      },
      { id: "clientes", label: "Clientes", href: "/clientes", Icon: IconPersonas },
      { id: "material", label: "Material", href: "/material", Icon: IconMaterial },
    ],
  },
  {
    id: "plata",
    label: "Plata",
    href: "/plata",
    Icon: IconBilletera,
    secciones: [
      { id: "cuenta", label: "Cuenta", href: "/plata", Icon: IconCashBox },
      { id: "ventas", label: "Ventas", href: "/comprobantes", Icon: IconReceipt },
      { id: "gastos", label: "Gastos", href: "/gastos", Icon: IconExpense },
      { id: "ganancia", label: "Ganancia", href: "/ganancia", Icon: IconGanancia },
    ],
  },
] as const;

export interface Ubicacion {
  sector: Sector;
  /** Sección activa. Toda ruta que cae en un sector cae también en una de
   * sus secciones (el href del sector es el de su primera sección). */
  seccion: Seccion;
}

interface Candidato {
  href: string;
  sector: Sector;
  seccion: Seccion;
}

/**
 * `/` solo matchea exacto (si no, matchearía cualquier ruta); el resto,
 * exacto o por prefijo `href + "/"`.
 */
function coincideRuta(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const CANDIDATOS: Candidato[] = SECTORES.flatMap((sector) =>
  sector.secciones.map((seccion) => ({ href: seccion.href, sector, seccion })),
);

/**
 * Resuelve el sector + sección activos a partir del pathname actual, por
 * coincidencia de prefijo MÁS LARGO entre los `href` de las secciones — así
 * "/stock/lotes/123" resuelve a Pedidos y no a Depósito, "/stock" a
 * Depósito, "/tareas/transferir" a Hoy › Para hacer, "/clientes/abc" a
 * Personas › Clientes y "/plata/deudas" a Plata › Cuenta. `null` si el
 * pathname no cae en ningún sector (ej. `/cambiar-password`, `/login`).
 *
 * Pura: sin `usePathname` ni ningún otro hook — cada consumidor le pasa
 * el pathname que ya tiene.
 */
export function resolverNavegacion(pathname: string): Ubicacion | null {
  let mejor: Candidato | null = null;
  for (const c of CANDIDATOS) {
    if (!coincideRuta(pathname, c.href)) continue;
    if (!mejor || c.href.length > mejor.href.length) mejor = c;
  }
  return mejor ? { sector: mejor.sector, seccion: mejor.seccion } : null;
}

/**
 * A dónde navega el tab al elegir un sector: su primera sección (Hoy → `/`,
 * Botellas → `/stock`, Personas → `/revendedores`, Plata → `/plata`).
 */
export function destinoDeSector(sector: Sector): string {
  return sector.secciones[0].href;
}
