import { AppHeader } from "@/components/app-header";
import { AppRail } from "@/components/app-rail";
import { InstalarAppBanner } from "@/components/instalar-app-banner";
import { PageHeaderProvider } from "@/components/page-header-context";
import { SectorChips } from "@/components/sector-chips";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { TabBar } from "@/components/tab-bar";
import { TareasBadgeProvider } from "@/components/tareas-badge";
import { UpdateBanner } from "@/components/update-banner";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <PageHeaderProvider>
      {/* Una sola fuente del número de tareas para el rail y la tab bar. */}
      <TareasBadgeProvider>
      <div className="flex min-h-full min-w-0 flex-1 flex-col bg-background lg:flex-row">
        <ServiceWorkerRegister />

        <AppHeader />
        <SectorChips />
        <AppRail />

        <div className="flex min-h-full min-w-0 flex-1 flex-col">
          {/*
            Ancho completo en escritorio: la app usa todo el ancho de la
            pantalla en vez de topear a 1120px centrado (a 1920px sobraban
            ~560px vacíos). El padding horizontal desktop es fluido
            (`--page-px`, app/globals.css) en vez de un `px-10` fijo, para
            que el contenido no quede pegado al borde en monitores anchos.
            Los propios componentes de página son quienes limitan su ancho
            cuando corresponde (formularios a 720px, detalles a 760px);
            listados y paneles usan el ancho completo de esta columna. Los
            bloques oliva que sangran hasta el borde usan
            `lg:-mx-[var(--page-px)]` (antes `-mx-10` fijo) para seguir
            tocando el borde de `<main>` con el mismo valor.
          */}
          <main className="mx-auto flex w-full min-w-0 flex-1 flex-col overflow-y-auto px-5 py-4 lg:px-[var(--page-px)] lg:py-[34px]">
            {children}
          </main>

          {/*
            En mobile queda en su lugar natural del flujo (esta columna no
            scrollea — solo <main> lo hace — así que se ve "fija" arriba de
            la tab bar sin necesidad de position:fixed). En desktop
            `lg:order-first` la sube arriba del contenido, ya que ahí no
            hay tab bar debajo de qué mostrarla.
          */}
          <UpdateBanner />
          <InstalarAppBanner />

          <TabBar />
        </div>
      </div>
      </TareasBadgeProvider>
    </PageHeaderProvider>
  );
}
