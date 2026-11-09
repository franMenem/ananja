"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, type ComponentProps, type MouseEvent } from "react";
import { useState } from "react";

import { Spinner } from "@/components/spinner";

/**
 * Hijo del `Link`: `useLinkStatus` solo funciona en un descendiente. Apila el
 * texto y el spinner en la misma celda (igual que `BotonAccion`) para que el
 * botón no cambie de ancho al empezar a navegar, y avisa el estado al padre.
 */
function Contenido({
  children,
  alCambiar,
}: {
  children: React.ReactNode;
  alCambiar: (pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    alCambiar(pending);
  }, [pending, alCambiar]);
  return (
    <span className="inline-grid items-center justify-items-center">
      <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${pending ? "invisible" : ""}`}>{children}</span>
      <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${pending ? "" : "invisible"}`}>
        <Spinner />
      </span>
    </span>
  );
}

/**
 * Enlace con aspecto de botón (`BOTON_*`). Mientras la ruta nueva llega
 * muestra el spinner, queda con `aria-busy`/`aria-disabled` y no deja
 * navegar dos veces. Mantiene el `href` real (teclado, botón del medio).
 */
export function LinkBoton({ children, onClick, ...rest }: ComponentProps<typeof Link>) {
  const [pending, setPending] = useState(false);
  return (
    <Link
      prefetch={false}
      {...rest}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      <Contenido alCambiar={setPending}>{children}</Contenido>
    </Link>
  );
}
