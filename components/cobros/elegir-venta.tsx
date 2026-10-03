"use client";

import { useState } from "react";
import Link from "next/link";

import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

type VentaPendiente = {
  id: string;
  deudaCentavos: number;
  fecha: string;
};

type ClienteElegirVentaProps = {
  ventas: VentaPendiente[];
};

/**
 * Botón "Registrar cobro" que, cuando el cliente tiene más de una venta
 * pendiente, abre una lista corta para elegir a cuál antes de ir a
 * `/comprobantes/[id]/cobro`. Con una sola venta pendiente,
 * `app/(app)/clientes/[id]/page.tsx` linkea directo y este componente no
 * se usa.
 */
export function ClienteElegirVenta({ ventas }: ClienteElegirVentaProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 items-center justify-center bg-primary px-4 text-xs font-medium tracking-[0.1em] text-background uppercase transition-colors hover:bg-primary-hover"
      >
        Registrar cobro
      </button>

      {open && (
        <div className="flex flex-col border border-border">
          <p className="border-b border-border px-3.5 py-2 text-[11px] tracking-[0.12em] text-text-muted uppercase">
            Elegí la venta a cobrar
          </p>
          {ventas.map((venta) => (
            <Link
              key={venta.id}
              href={`/comprobantes/${venta.id}/cobro`}
              className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 text-sm text-text last:border-b-0 hover:bg-surface-raised"
            >
              <span>{formatFecha(venta.fecha)}</span>
              <span className="tabular-nums text-accent">
                Debe {formatCentavos(venta.deudaCentavos)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
