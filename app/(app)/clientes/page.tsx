import Link from "next/link";

import { ClientesList } from "@/components/clientes-list";
import { armarFilasClientes } from "@/lib/dominio/clientes";
import {
  listarClientesActivos,
  listarComprobantesConCliente,
  listarDeudaClientes,
} from "@/lib/data/clientes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Listado de clientes activos (US7). El total comprado histórico y la
 * fecha de última compra se calculan acá agregando `comprobantes` por
 * `cliente_id`, igual que antes de la venta a crédito. La deuda por
 * cliente sale de `v_deuda_cliente` (vista, sin N+1 — Task 3): deudores
 * primero (deuda descendente), después alfabético (US Ventas a crédito,
 * decisión 4 del spec). El historial completo de compras sigue disponible
 * en el detalle del cliente.
 */
export default async function ClientesPage() {
  const supabase = await createClient();

  const [{ data: clientes }, { data: comprobantes }, { data: deudas }] = await Promise.all([
    listarClientesActivos(supabase),
    listarComprobantesConCliente(supabase),
    listarDeudaClientes(supabase),
  ]);

  const rows = armarFilasClientes(clientes, comprobantes, deudas);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-[28px] text-primary">Clientes</h1>
        <Link
          href="/comprobantes"
          className="text-[11px] tracking-[0.14em] text-text-muted uppercase hover:text-primary-hover"
        >
          ← Comprobantes
        </Link>
      </div>

      <ClientesList clientes={rows} />

      <Link
        href="/clientes/nuevo"
        className="flex min-h-[52px] items-center justify-center bg-primary text-[12px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
      >
        + Nuevo cliente
      </Link>
    </div>
  );
}
