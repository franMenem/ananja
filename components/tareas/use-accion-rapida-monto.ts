import { useRef, useState } from "react";

import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { formatMontoDisplay } from "@/lib/money";

/** Resultado de validar el texto del monto contra un tope (disponible en
 * mano) — mismo shape que ya devuelve `validarMontoDeposito`
 * (lib/tareas.ts), con el campo del tope renombrado a `topeCentavos` (el
 * componente adapta con un wrapper de una línea al pasarle `validar` al
 * hook). */
type ResultadoValidacionMonto =
  | { tipo: "ok"; centavos: number }
  | { tipo: "excede"; centavos: number; topeCentavos: number }
  | { tipo: "invalido" };

type ResultadoRpc = { error: { message: string; details?: string | null } | null };

type UseAccionRapidaMontoArgs = {
  /** Monto con el que arranca la hoja (`formatMontoDisplay`, lo hace el hook). */
  montoInicialCentavos: number;
  /** Valida el texto ingresado contra el tope actual. */
  validar: (texto: string, topeCentavos: number, permitirExceso: boolean) => ResultadoValidacionMonto;
  /** Llama al RPC ya armado con `medio`/`fecha`/lo que necesite — esos
   * campos siguen siendo estado local del componente, cerrado en este
   * closure (por eso `ejecutar` no es memoizado por el caller: cada render
   * pasa una versión fresca que ve el estado más reciente). */
  ejecutar: (args: { centavos: number; permitirExceso: boolean }) => Promise<ResultadoRpc>;
  /** Código de error del RPC que significa "te pasaste del tope"
   * (`SALDO_INSUFICIENTE` / `MONTO_MAYOR_A_DEUDA`) — dispara el estado
   * "excede" en vez de mostrarse como error de texto. */
  codigoExcede: string;
  /** Campo dentro de `rpcError.details` (JSON) con el tope real cuando el
   * RPC devuelve `codigoExcede` ("disponible" / "saldo_centavos"). */
  campoTopeEnDetalle: string;
  erroresPorCodigo: Record<string, string>;
  mensajeErrorGenerico: string;
  /** Se llama tras un guardado exitoso (`refrescarTareas` + `router.refresh()`). */
  onOk: () => void;
};

/**
 * Estado y flujo compartido de las hojas rápidas de monto de Tareas/Inicio
 * (hoy solo `DepositarRapido`): monto precargado con el tope pero editable,
 * un estado "excede" con las 3 acciones (Usar $tope / Guardar igual /
 * Revisar) cuando el monto escrito o el RPC dicen que se pasa del tope, y
 * un `ref` que evita mandar dos veces con un doble toque. Medio de pago y
 * fecha (cuando aplica) siguen siendo estado de cada componente — el hook
 * no sabe nada de eso, solo de "cuánto" y "cómo se guarda".
 */
export function useAccionRapidaMonto({
  montoInicialCentavos,
  validar,
  ejecutar,
  codigoExcede,
  campoTopeEnDetalle,
  erroresPorCodigo,
  mensajeErrorGenerico,
  onOk,
}: UseAccionRapidaMontoArgs) {
  const enviando = useRef(false);
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(formatMontoDisplay(montoInicialCentavos));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excedeCentavos, setExcedeCentavos] = useState<number | null>(null);

  function abrir() {
    setMonto(formatMontoDisplay(montoInicialCentavos));
    setError(null);
    setExcedeCentavos(null);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
  }

  async function enviar(opts?: { permitirExceso?: boolean; montoFijoCentavos?: number }) {
    if (enviando.current) return;
    setError(null);
    const permitirExceso = opts?.permitirExceso ?? false;

    let centavos: number;
    if (opts?.montoFijoCentavos !== undefined) {
      centavos = opts.montoFijoCentavos;
    } else {
      const validacion = validar(monto, montoInicialCentavos, permitirExceso);
      if (validacion.tipo === "invalido") {
        setError("Revisá el monto.");
        return;
      }
      if (validacion.tipo === "excede") {
        setExcedeCentavos(validacion.topeCentavos);
        return;
      }
      centavos = validacion.centavos;
    }

    enviando.current = true;
    setGuardando(true);
    let rpcError: { message: string; details?: string | null } | null = null;
    try {
      ({ error: rpcError } = await ejecutar({ centavos, permitirExceso }));
    } catch {
      rpcError = { message: "RED" };
    } finally {
      enviando.current = false;
      setGuardando(false);
    }

    if (rpcError) {
      if (rpcError.message === codigoExcede) {
        let tope = 0;
        try {
          const detalle = JSON.parse(rpcError.details ?? "{}") as Record<string, number | undefined>;
          tope = detalle[campoTopeEnDetalle] ?? 0;
        } catch {
          tope = 0;
        }
        setExcedeCentavos(tope);
      } else {
        setError(traducirErrorRpc(rpcError.message, erroresPorCodigo, mensajeErrorGenerico));
      }
      return;
    }

    setAbierto(false);
    onOk();
  }

  /** "Usar $tope": guarda directamente ese monto (nunca puede "exceder" su
   * propio tope, así que no hace falta `permitirExceso`). */
  function usarExcedente() {
    if (excedeCentavos === null) return;
    setMonto(formatMontoDisplay(excedeCentavos));
    setExcedeCentavos(null);
    void enviar({ montoFijoCentavos: excedeCentavos });
  }

  /** "Revisar": vuelve del estado "excede" a editar el monto, sin guardar. */
  function descartarExceso() {
    setExcedeCentavos(null);
  }

  return {
    abierto,
    abrir,
    cerrar,
    monto,
    setMonto,
    guardando,
    error,
    setError,
    excedeCentavos,
    enviar,
    usarExcedente,
    descartarExceso,
  };
}

