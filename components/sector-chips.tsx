"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolverNavegacion } from "@/lib/navegacion";

/**
 * Chips horizontales con TODAS las secciones del sector actual (incluida
 * la activa, marcada), para saltar entre ellas — ej. desde Gastos llegar
 * directo a Plata/Ganancia (`components/app-header.tsx` § chrome móvil).
 * Solo mobile: en escritorio el rail (`app-rail.tsx`) ya muestra todas
 * las secciones a la vez.
 *
 * Se oculta en Inicio y Tareas (sin secciones, `ubicacion.seccion`
 * siempre `null` ahí) y también cuando el sector tiene una sola sección
 * (nada que elegir). En Ventas/Producción/Plata, `seccion` no es nunca
 * `null` en la práctica: toda ruta bajo el sector cae en alguna de sus
 * secciones (Plata incluida — ver `resolverNavegacion`), así que los
 * chips se ven en cualquier pantalla de esos tres sectores.
 */
export function SectorChips() {
  const pathname = usePathname();
  const ubicacion = resolverNavegacion(pathname);

  if (!ubicacion?.seccion || ubicacion.sector.secciones.length < 2) {
    return null;
  }

  const { sector, seccion: activa } = ubicacion;

  return (
    // `SectorChips` es hermano de `<main>` (`app/(app)/layout.tsx`), no su
    // hijo — no hereda ningún `px-5` que cancelar, así que a diferencia de
    // los bloques oliva que sangran *dentro* de `<main>` (esos sí usan
    // `-mx-5`/`lg:-mx-[var(--page-px)]` para cancelar el padding del
    // padre), este `<nav>` ya ocupa el ancho completo del viewport sin
    // necesidad de margen negativo. Un `-mx-5` acá no cancela nada y sólo
    // empuja 20px afuera del viewport a cada lado → overflow horizontal
    // del documento entero. El `px-5` sin margen negativo alcanza para que
    // la tira toque los bordes (el contenedor ya es full width) y el
    // primer chip quede alineado con las tarjetas de abajo.
    <nav
      aria-label={`Secciones de ${sector.label}`}
      className="flex gap-2 overflow-x-auto px-5 pt-3 pb-1 lg:hidden"
    >
      {sector.secciones.map((seccion) => {
        const active = seccion.id === activa.id;
        return (
          <Link
            key={seccion.id}
            href={seccion.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 flex shrink-0 items-center whitespace-nowrap px-3 py-1.5 text-[11px] font-medium tracking-[0.1em] uppercase ${
              active
                ? "bg-primary text-background"
                : "border border-border text-text-muted"
            }`}
          >
            {seccion.label}
          </Link>
        );
      })}
    </nav>
  );
}
