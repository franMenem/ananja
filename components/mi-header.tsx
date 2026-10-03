"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useFormHeader } from "@/components/page-header-context";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import { useVendedorActual } from "@/lib/vendedor-actual";

/**
 * Cabecera móvil (`< lg`) del shell de revendedor (`components/mi/mi-shell.tsx`)
 * — mismo alto y franja oliva que `components/app-header.tsx`, sin selector
 * de pantalla y con "Cerrar sesión" visible siempre. En escritorio la marca,
 * la navegación, "Ver como admin" y "Cerrar sesión" viven en el rail
 * (`components/mi-rail.tsx`) y esta cabecera se oculta.
 *
 * En los formularios (`SetFormHeader`, ej. "Pagar a {encargado}", "Nueva
 * venta") muestra "← + título", igual que la cabecera de admin; en
 * escritorio ese título lo dibuja `TituloFormularioEscritorio` dentro del
 * contenido.
 *
 * "Ver como admin" (→ `/`) solo aparece cuando el usuario logueado es un
 * admin con espacio de revendedor propio (`revende`, ver
 * `0026_roles_pendiente_espacio_revendedor.sql`) — un revendedor "de
 * verdad" (`rol = 'revendedor'`) no tiene shell de admin al que volver.
 */
export function MiHeader() {
  const router = useRouter();
  const { vendedor } = useVendedorActual();
  const formHeader = useFormHeader();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (formHeader) {
    return (
      <header className="sticky top-0 z-10 border-b-2 border-mark bg-primary pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex items-start gap-3 px-5 pt-[14px] pb-3">
          <Link
            href={formHeader.backHref}
            aria-label={formHeader.backLabel}
            className="flex min-h-11 min-w-11 items-center justify-center text-[22px] leading-none text-background"
          >
            ←
          </Link>
          <h1 className="line-clamp-2 font-display text-[22px] text-background">
            {formHeader.title}
          </h1>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 border-b-2 border-mark bg-primary pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex items-center justify-between px-5 pt-[14px] pb-3 md:px-10 md:pt-[22px]">
        <Link
          href="/mi"
          className="font-display text-[25px] tracking-[0.16em] text-background md:text-[28px]"
        >
          {NEGOCIO.wordmark}
        </Link>
        <div className="flex items-center gap-4">
          {vendedor?.rol === "admin" && (
            <Link
              href="/"
              className="text-[11px] tracking-[0.14em] text-on-primary-muted uppercase"
            >
              Ver como admin
            </Link>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[11px] tracking-[0.14em] text-on-primary-muted uppercase"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
