"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { useCargar } from "@/components/cargar/cargar-provider";
import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { IconLogout, IconMas, IconRailToggle } from "@/components/icons";
import { useTareasPendientes } from "@/components/tareas-badge";
import { VerComoRevendedor } from "@/components/ver-como-revendedor";
import { NEGOCIO } from "@/lib/negocio";
import { SECTORES, destinoDeSector, resolverNavegacion } from "@/lib/navegacion";
import {
  guardarSidebarColapsado,
  leerSidebarColapsado,
  suscribirseSidebarColapsado,
} from "@/lib/sidebar-colapsado";
import { createClient } from "@/lib/supabase/client";

/** `getServerSnapshot` de `useSyncExternalStore` — no hay `localStorage` en
 * el servidor, así que el SSR siempre asume expandido. */
function leerSidebarColapsadoServer(): boolean {
  return false;
}

function itemClassName(active: boolean, colapsado: boolean): string {
  const layout = colapsado ? "justify-center px-0" : "gap-3 px-6";
  const color = active
    ? "border-mark bg-[#fff1eb] font-medium text-primary"
    : "border-transparent text-text-muted";
  return `flex min-h-11 items-center border-l-2 py-3 text-[14px] ${layout} ${color}`;
}

/**
 * Rail lateral de escritorio (`>= lg`) — design/handoff README § Chrome compartido, ancho
 * 238px expandido / 64px colapsado. Reemplaza la cabecera y la tab bar
 * móviles en pantallas grandes.
 *
 * Arriba, debajo de la marca, el botón "+ Cargar" (abre la hoja "¿Qué
 * pasó?", `components/cargar/`); después los cuatro sectores de
 * `lib/navegacion.ts` (única fuente de verdad compartida con
 * `tab-bar.tsx`/`app-header.tsx`), cada uno con su encabezado y sus
 * secciones. El encabezado es solo texto, sin link: acá ya se listan todas
 * las secciones. El número de tareas pendientes va sobre "Para hacer".
 *
 * La lista de ítems scrollea sola (`overflow-y-auto` + `min-h-0`) si no
 * entran verticalmente; el header (marca) y el footer ("ver como
 * revendedor" + cerrar sesión) quedan siempre fijos. La campana de avisos
 * se retiró de acá 2026-09-16 (Avisos se fundió en Tareas, ver
 * `components/notificaciones-banner.tsx` y `lib/notificaciones.ts`).
 *
 * **Colapso a solo íconos**: el botón junto al wordmark alterna entre
 * expandido (238px, ícono + texto) y colapsado (64px, solo ícono
 * centrado). La preferencia se persiste en `localStorage`
 * (`lib/sidebar-colapsado.ts`) y se lee con `useSyncExternalStore`: como no
 * hay `localStorage` en SSR, `getServerSnapshot` asume expandido, pero
 * React corrige al valor real del cliente en el commit de hidratación,
 * antes del primer paint — sin el flash expandido→colapsado que daría
 * `useState` + `useEffect`, y sin animar la transición de ancho en esa
 * corrección (nunca llega a pintarse el estado intermedio).
 *
 * **Fijo al scrollear**: la que scrollea es la ventana (no hay contenedor
 * con overflow propio), así que el rail es `lg:sticky lg:top-0 lg:h-dvh
 * lg:self-start`: ocupa exactamente el alto de la pantalla y se queda
 * pegado arriba mientras el contenido se mueve. Sin `self-start` el flex
 * lo estiraba al alto de toda la página y se iba con el scroll.
 */
export function AppRail() {
  const pathname = usePathname();
  const router = useRouter();
  const cantidadTareas = useTareasPendientes();
  const { abrir } = useCargar();
  const ubicacion = resolverNavegacion(pathname);

  const colapsado = useSyncExternalStore(
    suscribirseSidebarColapsado,
    leerSidebarColapsado,
    leerSidebarColapsadoServer,
  );

  function alternarColapsado() {
    guardarSidebarColapsado(!colapsado);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav
      aria-label="Navegación principal"
      className={`hidden shrink-0 flex-col border-r border-border bg-surface py-5 transition-[width] duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start ${
        colapsado ? "w-16" : "w-[238px]"
      }`}
    >
      <div
        className={`flex items-center border-b border-border pb-[22px] ${
          colapsado ? "justify-center px-0" : "justify-between px-6"
        }`}
      >
        {!colapsado && (
          <div>
            <span className="font-display block text-[28px] text-text">
              {NEGOCIO.wordmark}
            </span>
            <span className="mt-1 block text-[13px] text-text-muted">
              {NEGOCIO.subtitulo}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={alternarColapsado}
          aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!colapsado}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-text-muted"
        >
          <IconRailToggle className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className={colapsado ? "flex justify-center px-0 pt-4" : "px-4 pt-4"}>
        <button
          type="button"
          onClick={(e) => abrir(e.currentTarget)}
          aria-label={colapsado ? "Cargar algo" : undefined}
          title={colapsado ? "Cargar algo" : undefined}
          className={`flex items-center ${BOTON_PRIMARIO} ${
            colapsado ? "h-11 min-h-11 w-11 px-0" : "w-full gap-2 px-4"
          }`}
        >
          <IconMas className="h-5 w-5 shrink-0" />
          {!colapsado && <span>Cargar</span>}
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
        {SECTORES.map((sector) => (
          <li key={sector.id} className="mt-4 first:mt-2">
            {!colapsado && (
              <span className="block px-6 pb-1 text-[13px] font-medium text-text-muted">
                {sector.label}
              </span>
            )}
            <ul>
              {sector.secciones.map((seccion) => {
                const active = ubicacion?.seccion.id === seccion.id;
                const conBadge = seccion.id === "para-hacer" && cantidadTareas > 0;
                return (
                  <li key={seccion.id}>
                    <Link
                      href={seccion.href}
                      prefetch={seccion.href === destinoDeSector(sector) ? undefined : false}
                      aria-current={active ? "page" : undefined}
                      aria-label={
                        colapsado
                          ? conBadge
                            ? `${seccion.label} (${cantidadTareas})`
                            : seccion.label
                          : undefined
                      }
                      title={colapsado ? seccion.label : undefined}
                      className={itemClassName(active, colapsado)}
                    >
                      <span className="relative flex h-[19px] w-[19px] shrink-0 items-center justify-center">
                        <seccion.Icon className="h-[19px] w-[19px]" />
                        {/* Colapsado: número superpuesto al ícono (el
                            contexto es igual de angosto que la tab bar). */}
                        {colapsado && conBadge && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-1.5 -right-2 rounded-full bg-accent px-[5px] py-px text-[13px] leading-tight text-white"
                          >
                            {cantidadTareas}
                          </span>
                        )}
                      </span>
                      {!colapsado && <span>{seccion.label}</span>}
                      {!colapsado && conBadge && (
                        <span className="ml-auto rounded-full bg-accent px-[7px] py-px text-[13px] text-white">
                          {cantidadTareas}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <div className="border-t border-border pt-2">
        <VerComoRevendedor variante="rail" colapsado={colapsado} />
        <button
          type="button"
          onClick={handleSignOut}
          aria-label={colapsado ? "Cerrar sesión" : undefined}
          title={colapsado ? "Cerrar sesión" : undefined}
          className={`flex min-h-11 w-full items-center border-l-2 border-transparent py-3 text-left text-[14px] text-text-muted ${
            colapsado ? "justify-center px-0" : "gap-3 px-6"
          }`}
        >
          <IconLogout className="h-[19px] w-[19px] shrink-0" />
          {!colapsado && <span>Cerrar sesión</span>}
        </button>
      </div>
    </nav>
  );
}
