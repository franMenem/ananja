"use client";

import Link from "next/link";

import { useFormHeader } from "@/components/page-header-context";

/**
 * "← + título" de escritorio (`>= lg`) del espacio admin (`(app)`),
 * equivalente de `components/mi/titulo-formulario.tsx` (`(mi)`) pero con
 * el estilo propio de `(app)`: ícono "←" solo (no "← texto") + `<h1>`
 * aparte, en vez de un único link "← volver".
 *
 * Lee `useFormHeader()` — la MISMA fuente que ya usa `AppHeader` para la
 * cabecera oliva de mobile (`SetFormHeader` registra el valor) — así el
 * título de escritorio nunca puede desincronizarse del de mobile: antes
 * cada página copiaba el bloque a mano con un `<h1>` de texto fijo, que
 * quedaba desactualizado cuando el título mobile era dinámico (ver bug de
 * "Cargar movimiento"/"Revisá todo" en `carga-form.tsx`).
 *
 * Antes de que se registre ningún `SetFormHeader` (o después de
 * desmontarse) no renderiza nada, igual que antes cuando una página no
 * tenía el bloque.
 */
export function FormHeaderDesktop() {
  const formHeader = useFormHeader();
  if (!formHeader) return null;

  return (
    <div className="hidden items-center gap-3 lg:flex">
      <Link
        href={formHeader.backHref}
        aria-label={formHeader.backLabel}
        className="flex min-h-11 min-w-11 items-center justify-center text-[22px] leading-none text-primary"
      >
        ←
      </Link>
      <h1 className="font-display text-[22px] text-primary">{formHeader.title}</h1>
    </div>
  );
}
