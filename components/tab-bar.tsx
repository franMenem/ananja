"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTareasPendientes } from "@/components/tareas-badge";
import { SECTORES, destinoDeSector, resolverNavegacion } from "@/lib/navegacion";

/**
 * Tab bar móvil (`< md`) — un tab por sector de `lib/navegacion.ts`:
 * Inicio, Ventas, Producción, Plata, Tareas. Antes solo cubría 5 de las
 * 14 pantallas planas (Inicio, Comprobantes, Costos, Caja, Stock) sin
 * forma de llegar a las demás desde mobile; ahora cada tab lleva directo
 * a la primera sección del sector (`destinoDeSector` — Ventas →
 * `/comprobantes`, Producción → `/stock`, Plata → `/plata`) o, para
 * Inicio/Tareas, a la pantalla misma — y queda activo mientras la ruta
 * actual caiga en ese sector, sin importar en qué sección puntual (ver
 * `resolverNavegacion`).
 */
export function TabBar() {
  const pathname = usePathname();
  const cantidadTareas = useTareasPendientes();
  const ubicacion = resolverNavegacion(pathname);

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky bottom-0 z-10 border-t border-border bg-surface-raised pb-[calc(8px+env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="flex items-stretch justify-between">
        {SECTORES.map((sector) => {
          const active = ubicacion?.sector.id === sector.id;
          return (
            <li key={sector.id} className="flex-1">
              <Link
                href={destinoDeSector(sector)}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-[5px] px-1 py-2 pt-[11px] pb-2 text-[11px] tracking-[0.08em] uppercase ${
                  active
                    ? "-mt-px border-t-2 border-mark font-medium text-primary"
                    : "text-text-muted"
                }`}
              >
                <sector.Icon className="h-[21px] w-[21px]" />
                {/* `leading-[1.1]` + `text-center` en vez de `whitespace-nowrap`:
                    "Producción" es el label más largo (más que cualquiera de
                    los 5 anteriores — "Compr." era una abreviatura a
                    propósito) y a 375px puede necesitar 2 líneas; que
                    envuelva ahí en vez de desbordar la columna. */}
                <span className="text-center leading-[1.1] break-words">
                  {sector.label}
                </span>
                {sector.id === "tareas" && cantidadTareas > 0 && (
                  <span className="absolute top-1 right-[18%] bg-accent px-[5px] py-px text-[10px] text-background">
                    {cantidadTareas}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
