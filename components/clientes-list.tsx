"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { ClienteConStats } from "@/lib/dominio/clientes";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

export type { ClienteConStats };

/**
 * Listado de clientes activos con buscador (US7). El total comprado y la
 * fecha de última compra se calculan en el servidor agregando
 * `comprobantes`; la deuda sale de `v_deuda_cliente` — ver
 * app/(app)/clientes/page.tsx. Cuando hay deuda, "Debe $X" (acento)
 * reemplaza a "Última compra" en el mismo lugar (US Ventas a crédito).
 */
export function ClientesList({ clientes }: { clientes: ClienteConStats[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [clientes, query]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar cliente…"
        className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
      />

      {filtered.length === 0 ? (
        clientes.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <span className="h-0.5 w-10 bg-mark" aria-hidden="true" />
            <p className="font-display mt-5 text-[26px] leading-[1.2] text-primary text-balance">
              Todavía no cargaste ningún cliente.
            </p>
            <p className="mt-3.5 text-[13px] leading-[1.6] text-text-muted text-balance">
              Dale de alta a un cliente para llevar su historial de compras
              automáticamente.
            </p>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-text-muted">
            No hay clientes que coincidan.
          </p>
        )
      ) : (
        <ul className="flex flex-col">
          {filtered.map((cliente) => (
            <li key={cliente.id} className="border-b border-border">
              <Link
                href={`/clientes/${cliente.id}`}
                className="flex items-center justify-between gap-3 py-3.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-display text-[19px] text-primary">
                    {cliente.nombre}
                  </span>
                  <span className="truncate text-xs text-text-muted">
                    {cliente.telefono || "—"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-base font-medium text-text tabular-nums">
                    {formatCentavos(cliente.totalCentavos)}
                  </span>
                  {cliente.deudaCentavos > 0 ? (
                    <span className="text-[11px] font-medium text-accent">
                      Debe {formatCentavos(cliente.deudaCentavos)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-text-muted">
                      {cliente.ultimaCompra
                        ? `Última compra ${formatFecha(cliente.ultimaCompra)}`
                        : "Sin compras"}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
