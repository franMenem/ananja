"use client";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
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
        className={`${BOTON_PRIMARIO} flex px-4`}
      >
        Registrar cobro
      </button>

      {open && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <p className="border-b border-line px-4 py-2 text-[14px] text-text-muted">
            Elegí la venta a cobrar
          </p>
          {ventas.map((venta) => (
            <Link
              prefetch={false}
              key={venta.id}
              href={`/comprobantes/${venta.id}/cobro`}
              className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-[16px] text-text last:border-b-0 hover:bg-background"
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
