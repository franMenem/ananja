"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useFormHeader } from "@/components/page-header-context";
import { VerComoRevendedor } from "@/components/ver-como-revendedor";
import { NEGOCIO } from "@/lib/negocio";
import { resolverNavegacion } from "@/lib/navegacion";

/**
 * Nombre de pantalla para el header móvil, derivado de
 * `lib/navegacion.ts` (antes una lista `SCREEN_NAME_BY_PREFIX` duplicada
 * acá, desincronizada del rail — ej. `/stock` mostraba "Depósito" cuando
 * el rail decía "Stock"). Hoy › Resumen (pathname "/") no tiene nombre propio a
 * propósito, igual que antes: cae al `NEGOCIO.lugar` de más abajo en vez
 * de mostrar "Resumen".
 */
function screenName(pathname: string): string | null {
  const ubicacion = resolverNavegacion(pathname);
  if (!ubicacion || ubicacion.seccion.id === "resumen") return null;

  return ubicacion.seccion.label;
}

/**
 * Cabecera móvil oliva (`< lg`) — design/handoff README § Chrome compartido. En escritorio
 * la marca vive en el rail (`components/app-rail.tsx`) y esta cabecera se
 * oculta.
 */
export function AppHeader() {
  const pathname = usePathname();
  const name = screenName(pathname);
  const formHeader = useFormHeader();

  if (formHeader) {
    return (
      <header className="sticky top-0 z-10 border-b border-border bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex items-start gap-3 px-5 pt-[14px] pb-3">
          <Link
            prefetch={false}
            href={formHeader.backHref}
            aria-label={formHeader.backLabel}
            className="flex min-h-11 min-w-11 items-center justify-center text-[22px] leading-none text-text"
          >
            ←
          </Link>
          <h1 className="line-clamp-2 font-display text-[20px] text-text">
            {formHeader.title}
          </h1>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex items-center justify-between px-5 pt-[14px] pb-3">
        <Link
          href="/"
          className="flex min-h-11 items-center font-display text-[20px] text-text"
        >
          {NEGOCIO.wordmark}
        </Link>
        {/* En pantallas muy angostas el nombre de pantalla se esconde para
            dejar lugar al botón "Vista revendedor" (siempre visible para un
            admin, ver `VerComoRevendedor`). */}
        <span className="hidden text-[13px] text-text-muted min-[400px]:inline">
          {name ?? NEGOCIO.lugar}
        </span>
        <VerComoRevendedor variante="header" />
      </div>
    </header>
  );
}
