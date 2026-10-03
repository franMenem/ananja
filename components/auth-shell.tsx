import type { ReactNode } from "react";

import { NEGOCIO } from "@/lib/negocio";

/**
 * Layout compartido por las pantallas de auth (`/login`,
 * `/cambiar-password`).
 *
 * Mobile (`< md`): split vertical a sangre sin cambios — mitad oliva
 * arriba (wordmark + tagline, anclados abajo) y mitad crema abajo (el
 * formulario, con textura de papel).
 *
 * Escritorio (`md` en adelante): split horizontal de dos columnas a
 * pantalla completa (`min-h-dvh` cada una, sin scroll de página) en vez
 * del mobile embutido en una columna angosta centrada. Columna izquierda
 * oliva con el tagline centrado verticalmente; columna derecha crema con
 * el formulario centrado vertical y horizontalmente y topeado a ~400px.
 * `md` usa tamaños contenidos (poco margen todavía a 768–1023px); `lg`
 * (1024px) respira más, siguiendo el mismo criterio de 5b67c80.
 */
export function AuthShell({
  tagline,
  children,
}: {
  tagline: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-primary md:min-h-dvh md:flex-row">
      {/* Mitad/columna oliva */}
      <div className="flex min-w-0 flex-1 flex-col justify-end bg-primary px-7 pt-10 md:min-h-dvh md:flex-1 md:justify-center md:px-10 md:py-16 lg:px-16">
        <span className="text-[10px] tracking-[0.26em] text-on-primary-muted uppercase">
          {NEGOCIO.lugar}
        </span>
        <span className="font-display mt-2 text-[52px] leading-none tracking-[0.14em] text-background md:text-[40px] lg:text-[52px]">
          {NEGOCIO.wordmark}
        </span>
        <span className="mt-[18px] h-0.5 w-14 bg-mark" />
        <p className="font-display mt-[18px] text-[22px] leading-[1.35] text-pretty text-primary-2 italic md:text-[18px] lg:text-[22px]">
          {tagline}
        </p>
      </div>

      {/* Mitad/columna crema con grano — formulario */}
      <div className="paper-texture mt-11 flex min-w-0 flex-col px-7 pt-7 pb-[34px] md:mt-0 md:min-h-dvh md:flex-1 md:items-center md:justify-center md:px-10 md:py-16 lg:px-16">
        <div className="w-full md:max-w-[400px]">{children}</div>
      </div>
    </main>
  );
}
