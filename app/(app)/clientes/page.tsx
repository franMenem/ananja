import Link from "next/link";

import { ClientesList } from "@/components/clientes-list";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
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
    <div className="flex flex-col gap-6 pb-8">
      <EncabezadoPantalla
        titulo="Clientes"
        pregunta="¿Quién nos compra y quién debe?"
        acciones={
          <Link prefetch={false} href="/clientes/nuevo" className={`${BOTON_SECUNDARIO} flex px-4`}>
            + Nuevo cliente
          </Link>
        }
      />

      <ClientesList clientes={rows} />
    </div>
  );
}
