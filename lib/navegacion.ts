import type { ComponentType } from "react";

import {
  IconCashBox,
  IconExpense,
  IconGanancia,
  IconHome,
  IconInsumos,
  IconLotes,
  IconMaterial,
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
 * (`components/sector-chips.tsx`). Reemplaza las tres listas que antes
 * vivían duplicadas (y desincronizadas) en esos tres componentes.
 *
 * Reagrupa las 14 pantallas planas de antes en cuatro sectores —
 * Ventas, Producción, Plata, más Inicio y Tareas como ítems sueltos sin
 * secciones propias — decisión aprobada del rediseño de navegación
 * (dueño: la app resultaba confusa con todo al mismo nivel, y en mobile
 * solo 5 de los 14 ítems eran alcanzables desde la tab bar).
 *
 * Los hubs mobile (`/ventas`, `/produccion` — pantallas de solo links)
 * se eliminaron: el tab de cada sector lleva directo a su primera
 * sección (ver `destinoDeSector`) y `/ventas`/`/produccion` quedan como
 * redirects permanentes a esa primera sección (`next.config.ts`).
 */

export type IconComponent = ComponentType<{ className?: string }>;

export interface Seccion {
  id: string;
  label: string;
  href: string;
  Icon: IconComponent;
  /** Rutas de pantallas hijas que no tienen entrada propia en el menú pero
   * cuya "pantalla madre" es esta sección — ej. "/clientes" no es un tab
   * ni un ítem del rail (Clientes se retiró del menú de Ventas, se llega
   * desde el link "Clientes" de `/comprobantes`), pero cualquier ruta bajo
   * "/clientes" tiene que marcar activa la sección Comprobantes (rail,
   * tab bar y chips) en vez de resolver sin sección puntual. Vacío/ausente
   * para el resto de las secciones. */
  rutasHijas?: string[];
}

export interface Sector {
  id: string;
  label: string;
  /** Para Inicio/Tareas, la pantalla misma. Para los sectores con
   * secciones, la raíz del sector — ya no hay pantalla propia ahí (el
   * hub se eliminó), pero sigue sirviendo para que `resolverNavegacion`
   * agrupe bajo el sector cualquier ruta que no matchee una sección
   * puntual. La navegación real (tab bar) usa `destinoDeSector`. */
  href: string;
  Icon: IconComponent;
  /** Vacío para Inicio y Tareas — no son "sectores" con sub-pantallas. */
  secciones: Seccion[];
}

export const SECTORES: readonly Sector[] = [
  {
    id: "inicio",
    label: "Inicio",
    href: "/",
    Icon: IconHome,
    secciones: [],
  },
  {
    id: "ventas",
    label: "Ventas",
    href: "/ventas",
    Icon: IconReceipt,
    secciones: [
      {
        id: "comprobantes",
        label: "Comprobantes",
        href: "/comprobantes",
        Icon: IconReceipt,
        rutasHijas: ["/clientes"],
      },
      {
        id: "revendedores",
        label: "Revendedores",
        href: "/revendedores",
        Icon: IconRevendedores,
      },
      {
        id: "material",
        label: "Material",
        href: "/material",
        Icon: IconMaterial,
      },
    ],
  },
  {
    id: "produccion",
    label: "Producción",
    href: "/produccion",
    Icon: IconStock,
    secciones: [
      {
        id: "stock",
        label: "Depósito",
        href: "/stock",
        Icon: IconStock,
      },
      {
        id: "lotes",
        label: "Pedidos",
        href: "/stock/lotes",
        Icon: IconLotes,
      },
      {
        id: "insumos",
        label: "Insumos",
        href: "/stock/insumos",
        Icon: IconInsumos,
      },
    ],
  },
  {
    id: "plata",
    label: "Plata",
    href: "/plata",
    Icon: IconCashBox,
    secciones: [
      {
        id: "plata",
        label: "Plata",
        href: "/plata",
        Icon: IconCashBox,
      },
      {
        id: "gastos",
        label: "Gastos",
        href: "/gastos",
        Icon: IconExpense,
      },
      {
        id: "ganancia",
        label: "Ganancia",
        href: "/ganancia",
        Icon: IconGanancia,
      },
    ],
  },
  {
    id: "tareas",
    label: "Tareas",
    href: "/tareas",
    Icon: IconTareas,
    secciones: [],
  },
] as const;

export interface Ubicacion {
  sector: Sector;
  /** `null` cuando el pathname cae en el sector pero no en ninguna
   * sección puntual: siempre en Inicio/Tareas (no tienen secciones, ej.
   * `/tareas/transferir`), y en la práctica también para "/ventas" y
   * "/produccion" si se los consulta directo — rutas ya eliminadas que
   * redirigen antes de llegar a la app (`next.config.ts`). Plata nunca
   * resuelve `null` fuera de Inicio/Tareas: su sección "Plata" gana el
   * empate con el sector en cualquier ruta bajo `/plata` (ver
   * `resolverNavegacion`). */
  seccion: Seccion | null;
}

interface Candidato {
  href: string;
  sector: Sector;
  seccion: Seccion | null;
}

/**
 * `/` solo matchea exacto (si no, matchearía cualquier ruta); el resto,
 * exacto o por prefijo `href + "/"` — mismo criterio que usaban
 * `app-rail.tsx`/`tab-bar.tsx` antes de esta refactorización.
 */
function coincideRuta(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const CANDIDATOS: Candidato[] = SECTORES.flatMap((sector) => [
  { href: sector.href, sector, seccion: null },
  ...sector.secciones.flatMap((seccion) => [
    { href: seccion.href, sector, seccion },
    // Rutas hijas sin entrada propia en el menú (ej. "/clientes" bajo
    // Comprobantes, ver `Seccion.rutasHijas`): mismo sector/sección que su
    // pantalla madre, pura data — no hace falta un caso especial en
    // `resolverNavegacion` más allá de sumarlas acá a los candidatos.
    ...(seccion.rutasHijas ?? []).map((href) => ({ href, sector, seccion })),
  ]),
]);

/**
 * Resuelve el sector + sección activos a partir del pathname actual, por
 * coincidencia de prefijo MÁS LARGO entre todos los `href` de
 * {@link SECTORES} (sectores y secciones) — así "/stock/lotes/123" resuelve
 * a Lotes y no a Stock, "/stock" a Stock, "/tareas/transferir" al sector
 * Tareas (sin sección, no tiene), "/" exacto a Inicio, y "/ventas" (ruta ya
 * eliminada, redirige a `/comprobantes` — ver `next.config.ts`) al sector
 * Ventas sin sección puntual si igual se la consulta. `null` si el
 * pathname no cae en ningún sector (ej. `/cambiar-password`, `/login`).
 *
 * La sección "Plata" comparte href con su propio sector (`/plata`), caso
 * único en {@link SECTORES}: la sección puntual gana ese empate siempre,
 * tanto por match exacto ("/plata") como por prefijo ("/plata/deudas",
 * "/plata/cuenta/mercado_pago", "/plata/en-manos/123") — igual que
 * "/stock/nuevo" cae bajo "Stock" sin ambigüedad, esas rutas son
 * pantallas hijas de la sección Plata y tienen que marcarla activa (rail
 * y chips) en vez de resolver sin sección puntual.
 *
 * "Clientes" (2026-09-16) sigue el mismo patrón pero declarativo, vía
 * `Seccion.rutasHijas`: "/clientes" no tiene tab ni ítem de rail propio
 * (se llega desde el link "Clientes" de `/comprobantes`), pero cualquier
 * ruta bajo "/clientes" resuelve al sector Ventas CON la sección
 * "Comprobantes" marcada — su pantalla madre.
 *
 * Pura: sin `usePathname` ni ningún otro hook — cada consumidor le pasa
 * el pathname que ya tiene.
 */
export function resolverNavegacion(pathname: string): Ubicacion | null {
  const coincidencias = CANDIDATOS.filter((c) => coincideRuta(pathname, c.href));
  if (coincidencias.length === 0) return null;

  coincidencias.sort((a, b) => {
    const diferenciaLargo = b.href.length - a.href.length;
    if (diferenciaLargo !== 0) return diferenciaLargo;
    // Empate en href (solo pasa con "/plata", sector y sección a la
    // vez): la sección puntual gana sobre el sector solo.
    return (a.seccion ? 0 : 1) - (b.seccion ? 0 : 1);
  });
  const { sector, seccion } = coincidencias[0];
  return { sector, seccion };
}

/**
 * A dónde navega el tab/rail al elegir un sector: la primera sección si
 * tiene (Ventas → `/comprobantes`, Producción → `/stock`, Plata →
 * `/plata`, ya la primera), o la pantalla propia si no (Inicio, Tareas).
 * Reemplaza los hubs de solo-links que existían antes en `/ventas` y
 * `/produccion`.
 */
export function destinoDeSector(sector: Sector): string {
  return sector.secciones[0]?.href ?? sector.href;
}
