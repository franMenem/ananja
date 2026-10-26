import type { ReactNode } from "react";

import { IconoAviso } from "@/components/ui/campo";

/**
 * Aviso dentro de un formulario: bloque ámbar (fondo warning-tint, sin borde
 * de color a la izquierda) con ícono. Para cosas que hay que ver antes de
 * guardar (el dólar que viene del pedido anterior, el IVA…). No es un error:
 * los errores usan `MensajeError`.
 */
export function Aviso({
  children,
  role = "note",
  className = "",
}: {
  children: ReactNode;
  role?: "note" | "status" | "alert";
  className?: string;
}) {
  return (
    <div
      role={role}
      className={`flex items-start gap-2 rounded-xl bg-warning-tint px-3 py-3 text-[14px] leading-snug text-warning ${className}`}
    >
      <IconoAviso />
      <div className="flex min-w-0 flex-col gap-1 break-words">{children}</div>
    </div>
  );
}
