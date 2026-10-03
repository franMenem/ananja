import { InstalarAppBanner } from "@/components/instalar-app-banner";
import { MiHeader } from "@/components/mi-header";
import { MiRail } from "@/components/mi-rail";
import { MiTabBar } from "@/components/mi-tab-bar";
import { PageHeaderProvider } from "@/components/page-header-context";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { UpdateBanner } from "@/components/update-banner";

/**
 * Chrome del espacio de revendedor (`app/(mi)/layout.tsx`), con la misma
 * estructura que el shell de admin (`app/(app)/layout.tsx`):
 *  - Mobile/tablet (`< lg`): cabecera oliva arriba, contenido angosto
 *    (480px, como siempre) y tab bar abajo.
 *  - Escritorio (`>= lg`): rail a la izquierda (`MiRail`) y el contenido en
 *    todo el ancho que queda; cada página decide su ancho máximo (listas y
 *    detalles 760px, formularios 720px, inicio y ganancia en dos columnas).
 *
 * `UpdateBanner`/`InstalarAppBanner` viven en la columna del contenido,
 * igual que en admin: en mobile quedan arriba de la tab bar y en escritorio
 * (`lg:order-first`) suben arriba del contenido — antes, con una sola
 * columna que incluía la cabecera, en escritorio subían por encima de la
 * cabecera.
 */
export function MiShell({ children }: { children: React.ReactNode }) {
  return (
    <PageHeaderProvider>
      <div className="flex min-h-full min-w-0 flex-1 flex-col bg-background lg:flex-row">
        <ServiceWorkerRegister />

        <MiHeader />
        <MiRail />

        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          <main className="mx-auto flex w-full min-w-0 max-w-[480px] flex-1 flex-col overflow-y-auto px-5 py-4 lg:max-w-none lg:px-[var(--page-px)] lg:py-[34px]">
            {children}
          </main>

          <UpdateBanner />
          <InstalarAppBanner />
          <MiTabBar />
        </div>
      </div>
    </PageHeaderProvider>
  );
}
