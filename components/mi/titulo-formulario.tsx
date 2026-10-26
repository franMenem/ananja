"use client";

import Link from "next/link";

import { useFormHeader } from "@/components/page-header-context";

/**
 * Título de formulario del espacio de revendedor. En mobile el "← + título"
 * que registra `SetFormHeader` lo muestra la cabecera (`components/mi-header.tsx`);
 * en escritorio (`>= lg`) esa cabecera se oculta, así que el volver y el título
 * se dibujan acá, dentro del contenido. La `pregunta` ("¿Cuánto le pasaste?")
 * se ve en todos los tamaños, debajo del título. Lo coloca cada página dentro
 * de su propio contenedor (no el shell), así queda alineado con el formulario.
 */
export function TituloFormularioEscritorio({ pregunta }: { pregunta?: string }) {
  const formHeader = useFormHeader();

  return (
    <>
      {formHeader && (
        <div className="hidden flex-col gap-1 lg:flex">
          <Link
            prefetch={false}
            href={formHeader.backHref}
            className="inline-flex min-h-11 w-fit items-center text-[15px] text-text-muted hover:text-primary-hover"
          >
            ← {formHeader.backLabel}
          </Link>
          <h1 className="font-display text-[28px] leading-[1.1] font-bold text-text">{formHeader.title}</h1>
        </div>
      )}
      {pregunta && <p className="text-[15px] text-text-muted">{pregunta}</p>}
    </>
  );
}
