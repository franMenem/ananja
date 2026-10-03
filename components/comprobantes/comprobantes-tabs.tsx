import Link from "next/link";

import type { TabComprobantes } from "@/lib/dominio/comprobantes";

const TABS: { id: TabComprobantes; label: string; href: string }[] = [
  { id: "ventas", label: "Ventas", href: "/comprobantes" },
  { id: "pagos", label: "Pagos de revendedores", href: "/comprobantes?tab=pagos" },
];

/**
 * Pestañas de `/comprobantes`: son links (`?tab=`), no estado de cliente, así
 * que cada pestaña es una URL compartible y el servidor solo carga los datos
 * de la que está abierta. Mismo estilo que los chips de sección
 * (`components/sector-chips.tsx`). `flex-1` reparte el ancho a partes iguales
 * y `text-center` deja que "Pagos de revendedores" baje de renglón en
 * pantallas angostas en vez de desbordar.
 */
export function ComprobantesTabs({ activa }: { activa: TabComprobantes }) {
  return (
    <nav aria-label="Vistas de comprobantes" className="flex gap-2">
      {TABS.map((tab) => {
        const active = tab.id === activa;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 min-w-0 flex-1 items-center justify-center px-3 py-1.5 text-center text-[11px] leading-tight font-medium tracking-[0.1em] uppercase sm:flex-none sm:px-5 ${
              active ? "bg-primary text-background" : "border border-border text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
