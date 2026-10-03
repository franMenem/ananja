"use client";

import Link from "next/link";

import { useFormHeader } from "@/components/page-header-context";

/**
 * Título de formulario en escritorio (`>= lg`) del espacio de revendedor:
 * en mobile el "← + título" que registra `SetFormHeader` lo muestra la
 * cabecera oliva (`components/mi-header.tsx`), pero en escritorio esa
 * cabecera se oculta — sin esto, "Pagar a {encargado}" o "Nueva venta" se
 * quedaban sin título. Lo coloca cada página dentro de su propio contenedor
 * (no el shell), así queda alineado con el ancho del formulario.
 */
export function TituloFormularioEscritorio() {
  const formHeader = useFormHeader();
  if (!formHeader) return null;

  return (
    <div className="hidden flex-col gap-3 lg:flex">
      <Link
        href={formHeader.backHref}
        className="w-fit text-[11px] tracking-[0.14em] text-text-muted uppercase hover:text-primary-hover"
      >
        ← {formHeader.backLabel}
      </Link>
      <h1 className="font-display text-[34px] leading-[1.05] text-primary">{formHeader.title}</h1>
    </div>
  );
}
