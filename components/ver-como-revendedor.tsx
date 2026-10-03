"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { IconRevendedores } from "@/components/icons";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import { resetVendedorActualCache, useVendedorActual } from "@/lib/vendedor-actual";

type VerComoRevendedorProps = {
  /** `"rail"` — ítem del pie del rail de escritorio
   * (`components/app-rail.tsx`, mismo lenguaje que "Cerrar sesión").
   * `"header"` — botón con texto corto en la cabecera móvil
   * (`components/app-header.tsx`, junto a la campana). */
  variante: "rail" | "header";
  /** Solo aplica a `variante: "rail"` — rail colapsado a solo íconos
   * (ver `components/app-rail.tsx`): oculta el texto y centra el ícono. */
  colapsado?: boolean;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  ADMIN_INVALIDO: "Tu usuario no es un admin activo.",
};

/**
 * "Ver como revendedor" — visible para CUALQUIER admin activo (nunca para
 * un revendedor ni un pendiente: esos no cargan el shell de admin, ver
 * `lib/supabase/middleware.ts`).
 *  - Con espacio de revendedor (`revende`): link directo a `/mi`.
 *  - Sin espacio: abre un BottomSheet "¿Lo activamos?" que llama a
 *    `fijar_espacio_revendedor` (0026, un admin puede habilitárselo a sí
 *    mismo), limpia la caché de `useVendedorActual` y entra a `/mi` — el
 *    proxy lee `revende` de la base en cada request, así que ya lo deja
 *    pasar. Para volver: "Ver como admin" en `components/mi-header.tsx`.
 */
export function VerComoRevendedor({ variante, colapsado = false }: VerComoRevendedorProps) {
  const router = useRouter();
  const { vendedor } = useVendedorActual();
  const [abierto, setAbierto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!vendedor || vendedor.rol !== "admin" || !vendedor.activo) {
    return null;
  }

  async function handleActivar() {
    if (!vendedor) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("fijar_espacio_revendedor", {
      p_vendedor_id: vendedor.id,
      p_habilitar: true,
    });
    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo activar. Probá de nuevo."));
      setSaving(false);
      return;
    }
    resetVendedorActualCache();
    setSaving(false);
    setAbierto(false);
    router.push("/mi");
    router.refresh();
  }

  const contenidoHeader = (
    <>
      <IconRevendedores className="h-[16px] w-[16px] shrink-0" />
      <span>Vista revendedor</span>
    </>
  );
  const clasesHeader =
    "flex min-h-11 items-center gap-1.5 border border-primary-line px-2.5 text-[10px] tracking-[0.12em] text-background uppercase";

  const contenidoRail = (
    <>
      <IconRevendedores className="h-[19px] w-[19px] shrink-0" />
      {!colapsado && <span>Ver como revendedor</span>}
    </>
  );
  const clasesRail = `flex min-h-11 w-full items-center border-l-2 border-transparent py-3 text-left text-xs tracking-[0.14em] text-on-primary-muted uppercase hover:text-background ${
    colapsado ? "justify-center px-0" : "gap-3 px-6"
  }`;

  const disparador = vendedor.revende ? (
    <Link
      href="/mi"
      aria-label={variante === "rail" && colapsado ? "Ver como revendedor" : undefined}
      title={variante === "rail" && colapsado ? "Ver como revendedor" : undefined}
      className={variante === "header" ? clasesHeader : clasesRail}
    >
      {variante === "header" ? contenidoHeader : contenidoRail}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      aria-label={variante === "rail" && colapsado ? "Ver como revendedor" : undefined}
      title={variante === "rail" && colapsado ? "Ver como revendedor" : undefined}
      className={variante === "header" ? clasesHeader : clasesRail}
    >
      {variante === "header" ? contenidoHeader : contenidoRail}
    </button>
  );

  return (
    <>
      {disparador}
      {!vendedor.revende && (
        <BottomSheet
          open={abierto}
          ariaLabel="Activar tu espacio de revendedor"
          variant="mark"
        >
          <h2 className="font-display text-[24px] text-primary">
            Todavía no tenés tu espacio de revendedor. ¿Lo activamos?
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Vas a poder cargar tus propias ventas como revendedor, ver lo que le debés a{" "}
            {NEGOCIO.nombre} y tu ganancia. Para volver, tocá &quot;Ver como admin&quot;.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <BotonAccion
              cargando={saving}
              textoCargando="Activando…"
              type="button"
              onClick={handleActivar}
              className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
            >
              Sí, activarlo
            </BotonAccion>
            <button
              type="button"
              onClick={() => !saving && setAbierto(false)}
              disabled={saving}
              className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Ahora no
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
