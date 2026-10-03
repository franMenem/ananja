"use client";

import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  REVENDEDOR_INVALIDO: "Ese revendedor no existe.",
  PRODUCTO_INVALIDO: "Ese producto no existe.",
  PRECIO_INVALIDO: "Revisá el precio.",
};

type PrecioRevendedorRowProps = {
  vendedorId: string;
  productoId: string;
  productoNombre: string;
  precioActualCentavos: number | null;
  precioMayoristaCentavos: number | null;
};

/**
 * Fila editable inline de precio revendedor (`/revendedores/[id]`) — mismo
 * patrón input+Ok/Cancelar que `umbral_minimo` en `/stock/insumos/[id]`.
 * "Usar mayorista" precarga el input con `precioMayoristaCentavos` (de la
 * versión de Precios vigente, pasado por el server component padre) sin
 * llamar al RPC — sigue haciendo falta apretar "Ok" para guardarlo.
 */
export function PrecioRevendedorRow({
  vendedorId,
  productoId,
  productoNombre,
  precioActualCentavos,
  precioMayoristaCentavos,
}: PrecioRevendedorRowProps) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(
    precioActualCentavos !== null ? formatMontoDisplay(precioActualCentavos) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState(precioActualCentavos);

  async function handleGuardar() {
    const centavos = parseMontoInput(valor);
    if (centavos === null || centavos <= 0) {
      setError("Ingresá un precio válido.");
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("fijar_precio_revendedor", {
      p_vendedor_id: vendedorId,
      p_producto_id: productoId,
      p_precio_centavos: centavos,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar el precio. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setActual(centavos);
    setSaving(false);
    setEditando(false);
  }

  if (!editando) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border py-3">
        <span className="text-sm text-text">{productoNombre}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium tabular-nums text-text">
            {actual !== null ? formatCentavos(actual) : "Sin precio asignado"}
          </span>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-[11px] tracking-[0.12em] text-text-muted uppercase hover:text-primary"
          >
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3">
      <span className="text-sm text-text">{productoNombre}</span>
      <div className="flex items-start gap-2">
        <MontoInput
          ariaLabel={`Precio revendedor de ${productoNombre}`}
          value={valor}
          onChange={setValor}
          placeholder="$ 0,00"
          simbolo={null}
          className="min-w-0 flex-1"
          cajaClassName="flex items-center border-b border-primary"
          inputClassName="min-h-11 w-full min-w-0 bg-transparent px-1 text-base tabular-nums text-text focus:outline-none"
        />
        {precioMayoristaCentavos !== null && (
          <button
            type="button"
            onClick={() => setValor(formatMontoDisplay(precioMayoristaCentavos))}
            className="min-h-11 shrink-0 text-[11px] tracking-[0.1em] text-text-muted uppercase hover:text-primary"
          >
            Usar mayorista
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          type="button"
          onClick={handleGuardar}
          className="min-h-11 flex-1 bg-primary px-3 text-xs font-medium tracking-[0.1em] text-background uppercase disabled:opacity-45"
        >
          Ok
        </BotonAccion>
        <button
          type="button"
          onClick={() => {
            setEditando(false);
            setError(null);
          }}
          disabled={saving}
          className="min-h-11 flex-1 border border-border px-3 text-xs font-medium tracking-[0.1em] text-text-muted uppercase disabled:opacity-45"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
