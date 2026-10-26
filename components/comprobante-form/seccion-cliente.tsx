"use client";

import { ClienteSelect } from "@/components/cliente-select";
import { MensajeError } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";

type SeccionClienteProps = {
  clienteId: string | null;
  onClienteChange: (clienteId: string | null) => void;
  esVentaACredito: boolean;
};

/** Cliente opcional (US7) — obligatorio si queda saldo a cobrar. Extraído
 * de `components/comprobante-form.tsx`. */
export function SeccionCliente({ clienteId, onClienteChange, esVentaACredito }: SeccionClienteProps) {
  return (
    <SeccionForm titulo="¿A quién se la vendiste?">
      <ClienteSelect value={clienteId} onChange={(id) => onClienteChange(id)} />
      {esVentaACredito && !clienteId && (
        <MensajeError>Para dejar saldo a cobrar elegí un cliente.</MensajeError>
      )}
    </SeccionForm>
  );
}
