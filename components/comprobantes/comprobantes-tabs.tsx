import Link from "next/link";

import { claseChip } from "@/components/ui/chip";
import type { TabComprobantes } from "@/lib/dominio/comprobantes";

const TABS: { id: TabComprobantes; label: string; href: string }[] = [
  { id: "ventas", label: "Ventas", href: "/comprobantes" },
  { id: "pagos", label: "Pagos informados", href: "/comprobantes?tab=pagos" },
];

/**
 * Pestañas de `/comprobantes`: son links (`?tab=`), no estado de cliente, así
 * que cada pestaña es una URL compartible y el servidor solo carga los datos
 * de la que está abierta. Se ven como los chips de filtro del resto de la
 * app; `flex-1` reparte el ancho a partes iguales en celular.
 */
export function ComprobantesTabs({ activa }: { activa: TabComprobantes }) {
  return (
    <nav aria-label="Vistas de ventas" className="flex gap-2">
      {TABS.map((tab) => {
        const active = tab.id === activa;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`${claseChip(active)} min-w-0 flex-1 sm:flex-none sm:px-6`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
