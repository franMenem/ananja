"use client";

import { useMemo, useState } from "react";

import { ChevronFila, FilaLink } from "@/components/ui/estado-fila";
import { ListaTarjeta } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import type { ClienteConStats } from "@/lib/dominio/clientes";
import { detalleCliente, sinAcentos } from "@/lib/dominio/personas";
import { formatCentavos } from "@/lib/money";

export type { ClienteConStats };

/**
 * Listado de clientes activos con buscador (sin acentos). Una fila por
 * cliente con un solo estado: "Debe $X" (rojo) o "Al día" (verde). Las filas
 * llegan ya ordenadas: deudores primero, después por nombre
 * (`armarFilasClientes`). La deuda sale de `v_deuda_cliente`.
 */
export function ClientesList({ clientes }: { clientes: ClienteConStats[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = sinAcentos(query.trim());
    if (!q) return clientes;
    return clientes.filter((c) => sinAcentos(c.nombre).includes(q));
  }, [clientes, query]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre"
        aria-label="Buscar cliente por nombre"
        className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] text-text placeholder:text-text-muted focus:border-primary"
      />

      {filtered.length === 0 ? (
        clientes.length === 0 ? (
          <div className="flex flex-col gap-2 py-8">
            <p className="font-display text-[22px] leading-[1.2] font-bold text-text">
              Todavía no cargaste ningún cliente.
            </p>
            <p className="text-[16px] text-text-muted">
              Dale de alta a un cliente para llevar su historial de compras automáticamente.
            </p>
          </div>
        ) : (
          <p className="py-6 text-[16px] text-text-muted">No hay clientes que coincidan.</p>
        )
      ) : (
        <ListaTarjeta>
          {filtered.map((cliente) => (
            <FilaLink
              key={cliente.id}
              href={`/clientes/${cliente.id}`}
              izquierda={
                <div className="flex min-w-0 flex-col">
                  <span className="text-[16px] font-semibold break-words text-text">{cliente.nombre}</span>
                  <span className="text-[14px] text-text-muted">{detalleCliente(cliente)}</span>
                </div>
              }
              derecha={
                <>
                  {cliente.deudaCentavos > 0 ? (
                    <Pastilla variante="debe">Debe {formatCentavos(cliente.deudaCentavos)}</Pastilla>
                  ) : (
                    <Pastilla variante="ok">Al día</Pastilla>
                  )}
                  <ChevronFila />
                </>
              }
            />
          ))}
        </ListaTarjeta>
      )}
    </div>
  );
}
