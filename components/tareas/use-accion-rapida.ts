import { useState } from "react";

import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";

type ResultadoRpc = { error: { message: string } | null };

type OpcionesEjecutar = {
  erroresPorCodigo: Record<string, string>;
  mensajeErrorGenerico: string;
  /** Códigos de error que en realidad significan "ya no hay nada que hacer
   * acá" (otra persona ya lo resolvió) — en vez de mostrarse como error,
   * disparan `onExito` igual que un guardado exitoso, sin mensaje. */
  codigosSilenciosos?: string[];
  /** Se llama tanto en el éxito real como en un código silencioso — el
   * caller decide qué cerrar/refrescar (`cerrar()`, `refrescarTareas()`,
   * `router.refresh()`, resets propios como `motivo`). */
  onExito: () => void;
};

/**
 * Ciclo enviar→error→refrescar de las acciones rápidas de Tareas
 * (`ConfirmarPagoRapido`, `ConfirmarDepositoRapido`, `ResolverPago`):
 * guardando + error + una `ejecutar` que llama al RPC, traduce el error con
 * `traducirErrorRpc` si corresponde mostrarlo, o llama a `onExito` si el RPC
 * dio OK o devolvió un código de "ya resuelto". No sabe nada de montos ni de
 * tope (eso es `useAccionRapidaMonto`, para `DepositarRapido`) ni de abrir/
 * cerrar una hoja en particular — `abrir`/`cerrar`/`abierto` quedan acá
 * porque los tres casos con `BottomSheet` los necesitan igual, pero
 * `ResolverPago` (que vive en su propia página, sin hoja) simplemente no los
 * usa.
 */
export function useAccionRapida() {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    setError(null);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
  }

  async function ejecutar(rpcCall: () => Promise<ResultadoRpc>, opts: OpcionesEjecutar) {
    setGuardando(true);
    setError(null);
    const { error: rpcError } = await rpcCall();
    setGuardando(false);

    if (rpcError) {
      if (opts.codigosSilenciosos?.includes(rpcError.message)) {
        opts.onExito();
        return;
      }
      setError(traducirErrorRpc(rpcError.message, opts.erroresPorCodigo, opts.mensajeErrorGenerico));
      return;
    }

    opts.onExito();
  }

  return { abierto, abrir, cerrar, guardando, error, setError, ejecutar };
}
