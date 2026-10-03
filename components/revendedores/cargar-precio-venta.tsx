"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { parseMontoInput } from "@/lib/money";
import { envase } from "@/lib/negocio";
import { fijarPrecioVentaRevendedor } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para cambiar esta venta.",
  VENTA_NO_ENCONTRADA: "No encontramos esta venta.",
  PRECIO_INVALIDO: "Ingresá un precio válido.",
};

/**
 * "Cargar precio" de una venta sin precio de venta (la cargó un admin sin
 * saber a cuánto se vendió) — `fijar_precio_venta_revendedor`, aplica a
 * todas las filas de la venta (`grupo_id`). Si la venta tampoco tiene medio
 * de pago (`pideMedio`), lo pide en el mismo paso (opcional). Lo usan el
 * admin (`/revendedores/[id]`) y la revendedora (`/mi/ventas/[id]`).
 */
export function CargarPrecioVenta({
  grupoId,
  persona,
  pideMedio = false,
}: {
  grupoId: string;
  /** "vos": la revendedora ("¿A cuánto la vendiste?"); "ella": un admin. */
  persona: "vos" | "ella";
  /** La venta no tiene medio de pago cargado: ofrecer cargarlo también. */
  pideMedio?: boolean;
}) {
  const router = useRouter();
  const [precio, setPrecio] = useState("");
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar(event: React.FormEvent) {
    event.preventDefault();
    const centavos = parseMontoInput(precio);
    if (centavos === null || centavos <= 0) {
      setError("Ingresá un precio válido.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await fijarPrecioVentaRevendedor(
      supabase,
      grupoId,
      centavos,
      pideMedio ? medioPago : null,
    );
    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar. Probá de nuevo."));
      setSaving(false);
      return;
    }
    setSaving(false);
    setPrecio("");
    setMedioPago(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleGuardar} className="flex flex-col gap-2">
      <MontoInput
        id={`precio-${grupoId}`}
        label={`${persona === "vos" ? "¿A cuánto la vendiste?" : "¿A cuánto la vendió?"} (por ${envase(1)})`}
        value={precio}
        onChange={setPrecio}
        placeholder="$ 0,00"
        simbolo={null}
        labelClassName="block text-[10px] tracking-[0.14em] text-text-muted uppercase"
        cajaClassName="mt-2 flex items-center border border-border bg-surface px-3 focus-within:border-primary"
        inputClassName="min-h-11 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none"
      />
      {pideMedio && (
        <div className="flex flex-col gap-1">
          <MedioPagoChips value={medioPago} onChange={setMedioPago} />
          <span className="text-[11px] text-text-muted">
            {persona === "vos" ? "¿Cómo te pagaron?" : "¿Cómo le pagaron?"} Opcional.
          </span>
        </div>
      )}
      <BotonAccion
        cargando={saving}
        textoCargando="Guardando…"
        type="submit"
        className="flex min-h-11 items-center justify-center self-start bg-primary px-4 text-[12px] font-medium tracking-[0.12em] text-background uppercase disabled:opacity-45"
      >
        Cargar precio
      </BotonAccion>
      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
    </form>
  );
}
