import Link from "next/link";

import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

import { Separador } from "./separador";

type Deudor = { vendedor_id: string; nombre: string; saldo_centavos: number };
type Clientes = { cantidad: number; totalCentavos: number };

/**
 * Bloque 3 de `/plata` — "Le deben a Ananja": revendedoras
 * (`v_deuda_vendedor`, del más grande al más chico — pedido explícito de
 * Fran) más una fila agregada de clientes (`v_deuda_cliente`, vía
 * `resumirClientes`). Total a la derecha del título.
 */
export function LeDeben({
  deudores,
  clientes,
  total,
}: {
  deudores: Deudor[];
  clientes: Clientes;
  total: number;
}) {
  return (
    <div className="flex flex-col pt-8">
      <Separador titulo="Le deben a Ananja" total={formatCentavos(total)} />
      {deudores.length === 0 && clientes.cantidad === 0 ? (
        <p className="py-2 text-sm text-text-muted">
          Nadie le debe plata a {NEGOCIO.nombre} en este momento.
        </p>
      ) : (
        <div className="flex flex-col">
          {deudores.map((d) => (
            <Link
              key={d.vendedor_id}
              href={`/revendedores/${d.vendedor_id}`}
              className="flex items-center justify-between gap-3 border-b border-border py-3 hover:bg-border/30"
            >
              <span className="text-text">{d.nombre}</span>
              <span className="font-medium tabular-nums text-accent">
                {formatCentavos(d.saldo_centavos)}
              </span>
            </Link>
          ))}
          {clientes.cantidad > 0 && (
            <Link
              href="/clientes"
              className="flex items-center justify-between gap-3 border-b border-border py-3 hover:bg-border/30"
            >
              <span className="text-text">Clientes ({clientes.cantidad})</span>
              <span className="font-medium tabular-nums text-accent">
                {formatCentavos(clientes.totalCentavos)}
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
