"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { IconHome, IconLogout, IconRailToggle } from "@/components/icons";
import { NEGOCIO } from "@/lib/negocio";
import { tabActivaMi, tabsParaRol } from "@/lib/navegacion-mi";
import {
  guardarSidebarColapsado,
  leerSidebarColapsado,
  suscribirseSidebarColapsado,
} from "@/lib/sidebar-colapsado";
import { createClient } from "@/lib/supabase/client";
import { useVendedorActual } from "@/lib/vendedor-actual";

/** SSR: no hay `localStorage`, se asume expandido (ver `components/app-rail.tsx`). */
function leerSidebarColapsadoServer(): boolean {
  return false;
}

function itemClassName(active: boolean, colapsado: boolean): string {
  const layout = colapsado ? "justify-center px-0" : "gap-3 px-6";
  const color = active
    ? "border-mark bg-primary-active font-medium text-background"
    : "border-transparent text-on-primary-muted hover:text-background";
  return `flex min-h-11 w-full items-center border-l-2 py-3 text-left text-xs tracking-[0.14em] uppercase ${layout} ${color}`;
}

/**
 * Rail lateral de escritorio (`>= lg`) del espacio de revendedor — mismo
 * lenguaje que el rail de admin (`components/app-rail.tsx`): franja oliva
 * de 238px (64px colapsado, preferencia compartida en `localStorage` vía
 * `lib/sidebar-colapsado.ts`), wordmark arriba, las 4 secciones de
 * `lib/navegacion-mi.ts` y al pie "Ver como admin" (solo admins con espacio
 * propio) y "Cerrar sesión". Reemplaza la cabecera y la tab bar móviles
 * (`mi-header.tsx`, `mi-tab-bar.tsx`) en pantallas grandes.
 *
 * **Fijo al scrollear**: la que scrollea es la ventana (no hay contenedor
 * con overflow propio), así que el rail es `lg:sticky lg:top-0 lg:h-dvh
 * lg:self-start`: ocupa exactamente el alto de la pantalla y se queda
 * pegado arriba mientras el contenido se mueve. Sin `self-start` el flex
 * lo estiraba al alto de toda la página y se iba con el scroll.
 */
export function MiRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { vendedor } = useVendedorActual();
  const tabs = tabsParaRol(vendedor?.rol);
  const activa = tabActivaMi(pathname, tabs);

  const colapsado = useSyncExternalStore(
    suscribirseSidebarColapsado,
    leerSidebarColapsado,
    leerSidebarColapsadoServer,
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav
      aria-label="Navegación principal"
      className={`hidden shrink-0 flex-col bg-primary py-5 transition-[width] duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start ${
        colapsado ? "w-16" : "w-[238px]"
      }`}
    >
      <div
        className={`flex items-center border-b border-primary-line pb-[22px] ${
          colapsado ? "justify-center px-0" : "justify-between px-6"
        }`}
      >
        {!colapsado && (
          <Link href="/mi" className="min-w-0">
            <span className="font-display block text-[28px] tracking-[0.16em] text-background">
              {NEGOCIO.wordmark}
            </span>
            <span className="mt-1 block text-[10px] tracking-[0.10em] text-on-primary-muted uppercase">
              {vendedor?.rol === "coordinador" ? "Espacio coordinador" : "Espacio revendedor"}
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => guardarSidebarColapsado(!colapsado)}
          aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!colapsado}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-on-primary-muted"
        >
          <IconRailToggle className="h-[18px] w-[18px]" />
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === activa;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={colapsado ? label : undefined}
                title={colapsado ? label : undefined}
                className={itemClassName(active, colapsado)}
              >
                <Icon className="h-[19px] w-[19px] shrink-0" />
                {!colapsado && <span>{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-primary-line pt-2">
        {vendedor?.rol === "admin" && (
          <Link
            href="/"
            aria-label={colapsado ? "Ver como admin" : undefined}
            title={colapsado ? "Ver como admin" : undefined}
            className={itemClassName(false, colapsado)}
          >
            <IconHome className="h-[19px] w-[19px] shrink-0" />
            {!colapsado && <span>Ver como admin</span>}
          </Link>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          aria-label={colapsado ? "Cerrar sesión" : undefined}
          title={colapsado ? "Cerrar sesión" : undefined}
          className={itemClassName(false, colapsado)}
        >
          <IconLogout className="h-[19px] w-[19px] shrink-0" />
          {!colapsado && <span>Cerrar sesión</span>}
        </button>
      </div>
    </nav>
  );
}
