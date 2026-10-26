import type { ReactNode } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { SetFormHeader } from "@/components/page-header-context";
import { Tarjeta } from "@/components/ui/tarjeta";

type MaxWidth = 720 | 760 | "none";
type Gap = 5 | 6 | 8;

// Tailwind no genera clases armadas con template literals (`gap-${gap}`,
// `max-w-[${n}px]`) — necesita ver el string completo en el código fuente.
// Estos mapas son la forma de seguir soportando varias medidas sin
// interpolar.
const MAX_WIDTH_CLASS: Record<Exclude<MaxWidth, "none">, string> = {
  720: "max-w-[720px]",
  760: "max-w-[760px]",
};
const GAP_CLASS: Record<Gap, string> = {
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
};

type FormPageProps = {
  title: string;
  backHref: string;
  backLabel: string;
  /** Ancho del contenedor `mx-auto` — `"none"` cuando la página no envuelve
   * en un `mx-auto max-w-[…]` (casos "página-lista", ver plan § 1.C). */
  maxWidth?: MaxWidth;
  gap?: Gap;
  /** `true` agrega `pb-8` (algunas páginas lo tenían, otras no). */
  pb?: boolean;
  /** La pregunta que responde la pantalla (15px, gris), debajo del título. */
  pregunta?: ReactNode;
  /** `true` pone el contenido (formulario) dentro de una `Tarjeta`. */
  tarjeta?: boolean;
  children: ReactNode;
};

/**
 * Wrapper de "página de formulario" del espacio admin (`(app)`): agrupa
 * `SetFormHeader` (título mobile, vía `AppHeader`) + `FormHeaderDesktop`
 * (mismo título en escritorio) + el contenedor de ancho que cada página ya
 * traía a mano. Reemplaza las ~17 copias literales del mismo bloque
 * — no fuerza un layout único, cada página sigue
 * eligiendo su propio `maxWidth`/`gap`/`pb` tal como los tenía.
 *
 * No cubre los formularios donde el TÍTULO lo pone el form component (no
 * la página) — esos usan `<FormHeaderDesktop />` directo junto a su propio
 * `<SetFormHeader>` (plan § 1, casos E/F).
 */
export function FormPage({
  title,
  backHref,
  backLabel,
  maxWidth = 720,
  gap = 5,
  pb = false,
  pregunta,
  tarjeta = false,
  children,
}: FormPageProps) {
  const inner = (
    <div className={`flex flex-col ${GAP_CLASS[gap]}${pb ? " pb-8" : ""}`}>
      <SetFormHeader title={title} backHref={backHref} backLabel={backLabel} />
      <FormHeaderDesktop />
      {pregunta && <p className="-mt-2 text-[15px] text-text-muted">{pregunta}</p>}
      {tarjeta ? <Tarjeta className="flex flex-col gap-5">{children}</Tarjeta> : children}
    </div>
  );

  if (maxWidth === "none") return inner;

  return <div className={`mx-auto w-full ${MAX_WIDTH_CLASS[maxWidth]}`}>{inner}</div>;
}
