"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { IconLogout, IconRailToggle } from "@/components/icons";
import { useTareasPendientes } from "@/components/tareas-badge";
import { VerComoRevendedor } from "@/components/ver-como-revendedor";
import { NEGOCIO } from "@/lib/negocio";
import { SECTORES, resolverNavegacion } from "@/lib/navegacion";
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

const [INICIO, ...RESTO] = SECTORES;
const TAREAS = RESTO[RESTO.length - 1];
const SECTORES_CON_SECCIONES = RESTO.slice(0, -1);

function itemClassName(active: boolean, colapsado: boolean): string {
  const layout = colapsado ? "justify-center px-0" : "gap-3 px-6";
  const color = active
    ? "border-mark bg-primary-active font-medium text-background"
    : "border-transparent text-on-primary-muted";
  return `flex min-h-11 items-center border-l-2 py-3 text-xs tracking-[0.14em] uppercase ${layout} ${color}`;
}

/**
 * Rail lateral de escritorio (`>= md`) — design/handoff README § Chrome compartido, ancho
 * 238px expandido / 64px colapsado. Reemplaza la cabecera y la tab bar
 * móviles en pantallas grandes.
 *
 * Reagrupado por sectores (`lib/navegacion.ts`, única fuente de verdad
 * compartida con `tab-bar.tsx`/`app-header.tsx`): Inicio suelto, luego
 * cada sector con secciones (Ventas/Producción/Plata) como encabezado en
 * mayúsculas + sus secciones debajo, y Tareas suelto al final. El
 * encabezado de sector es solo texto, sin link — no hace falta: acá ya
 * se listan todas las secciones debajo (a diferencia de mobile, que
 * navega a la primera sección del sector vía `destinoDeSector`).
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
          <div>
            <span className="font-display block text-[28px] tracking-[0.16em] text-background">
              {NEGOCIO.wordmark}
            </span>
            <span className="mt-1 block text-[10px] tracking-[0.10em] text-on-primary-muted uppercase">
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
          className="flex h-11 w-11 shrink-0 items-center justify-center text-on-primary-muted"
        >
          <IconRailToggle className="h-[18px] w-[18px]" />
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
        <li>
          <Link
            href={INICIO.href}
            aria-current={ubicacion?.sector.id === INICIO.id ? "page" : undefined}
            aria-label={colapsado ? INICIO.label : undefined}
            title={colapsado ? INICIO.label : undefined}
            className={itemClassName(ubicacion?.sector.id === INICIO.id, colapsado)}
          >
            <INICIO.Icon className="h-[19px] w-[19px] shrink-0" />
            {!colapsado && <span>{INICIO.label}</span>}
          </Link>
        </li>

        {SECTORES_CON_SECCIONES.map((sector) => (
          <li key={sector.id} className="mt-4 first:mt-2">
            {!colapsado && (
              <span className="block px-6 pb-1 text-[10px] font-medium tracking-[0.18em] text-on-primary-muted/70 uppercase">
                {sector.label}
              </span>
            )}
            <ul>
              {sector.secciones.map((seccion) => {
                const active = ubicacion?.seccion?.id === seccion.id;
                return (
                  <li key={seccion.id}>
                    <Link
                      href={seccion.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={colapsado ? seccion.label : undefined}
                      title={colapsado ? seccion.label : undefined}
                      className={itemClassName(active, colapsado)}
                    >
                      <seccion.Icon className="h-[19px] w-[19px] shrink-0" />
                      {!colapsado && <span>{seccion.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}

        <li className="mt-4">
          <Link
            href={TAREAS.href}
            aria-current={ubicacion?.sector.id === TAREAS.id ? "page" : undefined}
            aria-label={
              colapsado
                ? cantidadTareas > 0
                  ? `${TAREAS.label} (${cantidadTareas})`
                  : TAREAS.label
                : undefined
            }
            title={colapsado ? TAREAS.label : undefined}
            className={itemClassName(ubicacion?.sector.id === TAREAS.id, colapsado)}
          >
            <span className="relative flex h-[19px] w-[19px] shrink-0 items-center justify-center">
              <TAREAS.Icon className="h-[19px] w-[19px]" />
              {/* Colapsado: número superpuesto al ícono, igual que
                  `tab-bar.tsx` (contexto igual de angosto y solo-ícono) —
                  acá el número importa de un vistazo, a diferencia de un
                  simple indicador binario de "hay o no hay novedades". */}
              {colapsado && cantidadTareas > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-2 bg-accent px-[4px] py-px text-[9px] leading-tight text-background"
                >
                  {cantidadTareas}
                </span>
              )}
            </span>
            {!colapsado && <span>{TAREAS.label}</span>}
            {!colapsado && cantidadTareas > 0 && (
              <span className="ml-auto bg-accent px-[7px] py-px text-[11px] text-background">
                {cantidadTareas}
              </span>
            )}
          </Link>
        </li>
      </ul>

      <div className="border-t border-primary-line pt-2">
        <VerComoRevendedor variante="rail" colapsado={colapsado} />
        <button
          type="button"
          onClick={handleSignOut}
          aria-label={colapsado ? "Cerrar sesión" : undefined}
          title={colapsado ? "Cerrar sesión" : undefined}
          className={`flex min-h-11 w-full items-center border-l-2 border-transparent py-3 text-left text-xs tracking-[0.14em] text-on-primary-muted uppercase ${
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
