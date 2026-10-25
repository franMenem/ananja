"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCargar } from "@/components/cargar/cargar-provider";
import { IconMas } from "@/components/icons";
import { useTareasPendientes } from "@/components/tareas-badge";
import { SECTORES, destinoDeSector, resolverNavegacion, type Sector } from "@/lib/navegacion";

/**
 * Tab bar móvil (`< lg`) — cinco posiciones: Hoy · Botellas · [+] ·
 * Personas · Plata. Los cuatro tabs son los sectores de
 * `lib/navegacion.ts` (cada uno lleva a su primera sección,
 * `destinoDeSector`, y queda activo mientras la ruta caiga en el sector);
 * el del medio es el botón "+" que abre la hoja "¿Qué pasó?"
 * (`components/cargar/`). El número de tareas pendientes se muestra sobre
 * el tab Hoy.
 */
export function TabBar() {
  const pathname = usePathname();
  const cantidadTareas = useTareasPendientes();
  const { abrir } = useCargar();
  const ubicacion = resolverNavegacion(pathname);

  const [hoy, botellas, personas, plata] = SECTORES;

  function tab(sector: Sector) {
    const active = ubicacion?.sector.id === sector.id;
    return (
      <li key={sector.id} className="flex-1">
        <Link
          href={destinoDeSector(sector)}
          aria-current={active ? "page" : undefined}
          className={`relative flex min-h-14 flex-col items-center justify-center gap-[5px] px-1 pt-2 pb-2 text-[13px] ${
            active ? "font-medium text-primary" : "text-text-muted"
          }`}
        >
          <span className="relative">
            <sector.Icon className="h-[22px] w-[22px]" />
            {sector.id === "hoy" && cantidadTareas > 0 && (
              <span
                aria-label={`${cantidadTareas} para hacer`}
                className="absolute -top-1.5 -right-3 rounded-full bg-accent px-[5px] py-px text-[13px] leading-tight text-white"
              >
                {cantidadTareas}
              </span>
            )}
          </span>
          <span className="text-center leading-[1.1] break-words">{sector.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky bottom-0 z-10 border-t border-border bg-surface pb-[calc(8px+env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="flex items-stretch justify-between">
        {tab(hoy)}
        {tab(botellas)}
        <li className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={(e) => abrir(e.currentTarget)}
            aria-label="Cargar algo"
            className="-mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_12px_rgba(0,0,0,0.22)] transition-colors hover:bg-primary-hover active:bg-primary-active"
          >
            <IconMas className="h-7 w-7" />
          </button>
        </li>
        {tab(personas)}
        {tab(plata)}
      </ul>
    </nav>
  );
}
