"use client";

import { ClienteSelect } from "@/components/cliente-select";

type SeccionClienteProps = {
  clienteId: string | null;
  onClienteChange: (clienteId: string | null) => void;
  esVentaACredito: boolean;
};

/** Cliente opcional (US7) — obligatorio si queda saldo a cobrar. Extraído
 * de `components/comprobante-form.tsx`. */
export function SeccionCliente({ clienteId, onClienteChange, esVentaACredito }: SeccionClienteProps) {
  return (
    <>
      <ClienteSelect value={clienteId} onChange={(id) => onClienteChange(id)} />
      {esVentaACredito && !clienteId && (
        <p role="alert" className="text-xs text-accent">
          Para dejar saldo a cobrar elegí un cliente.
        </p>
      )}
    </>
  );
}
