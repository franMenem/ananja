"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { tabActivaMi, tabsParaRol } from "@/lib/navegacion-mi";
import { useVendedorActual } from "@/lib/vendedor-actual";

/**
 * Tab bar del shell de revendedor — solo mobile/tablet (`< lg`), igual que
 * `components/tab-bar.tsx`: en escritorio la navegación vive en el rail
 * (`components/mi-rail.tsx`). Los ítems salen de `lib/navegacion-mi.ts`
 * según el rol (un coordinador, 0055, no tiene ninguno — una sola
 * pantalla), compartidos con el rail.
 */
export function MiTabBar() {
  const pathname = usePathname();
  const { vendedor } = useVendedorActual();
  const tabs = tabsParaRol(vendedor?.rol);
  const activeHref = tabActivaMi(pathname, tabs);

  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="Navegación"
      className="sticky bottom-0 z-10 border-t border-border bg-surface-raised pb-[calc(8px+env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="mx-auto flex w-full max-w-[480px] items-stretch justify-between">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === activeHref;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-[5px] py-2 pt-[11px] pb-2 text-[11px] tracking-[0.12em] uppercase ${
                  active
                    ? "-mt-px border-t-2 border-mark font-medium text-primary"
                    : "text-text-muted"
                }`}
              >
                <Icon className="h-[21px] w-[21px]" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
