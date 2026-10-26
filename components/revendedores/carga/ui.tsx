import type { ReactNode } from "react";

import { CLASE_CAJA_MONTO, CLASE_ENTRADA, CLASE_ETIQUETA, CLASE_INPUT_EN_CAJA, MensajeError } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import type { ProblemaCarga } from "@/lib/dominio/carga-revendedor";

/** Estilos compartidos por los campos de las tres secciones de `CargaForm`
 * (base común de `components/ui/campo.tsx`). */
export const ROTULO = CLASE_ETIQUETA;
export const CAMPO = `mt-1.5 ${CLASE_ENTRADA}`;
export const CAJA_MONTO = CLASE_CAJA_MONTO;
export const INPUT_MONTO = CLASE_INPUT_EN_CAJA;
export const LINK_CHICO = "inline-flex min-h-11 items-center text-[15px] font-semibold ";

/** Una de las tres partes de `CargaForm` (Entrega, Ventas, Pago). Abierta es
 * una Tarjeta con título de sección y su contenido. Cerrada se ve como un
 * encabezado con "Sumar" o, con `comoEnlace` (cuando la pantalla se abrió
 * para UNA acción), como un link "+ Agregar también…". `bloqueada` = la
 * sección principal, que no se puede sacar. */
export function Seccion({
  titulo,
  descripcion,
  activa,
  bloqueada = false,
  comoEnlace,
  onToggle,
  children,
}: {
  titulo: string;
  descripcion: ReactNode;
  activa: boolean;
  bloqueada?: boolean;
  /** Texto del link cuando la sección está cerrada ("+ Agregar también una venta"). */
  comoEnlace?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!activa && comoEnlace) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="inline-flex min-h-11 items-center self-start rounded-xl px-1 text-left text-[15px] font-semibold text-primary"
      >
        {comoEnlace}
      </button>
    );
  }

  const boton = !bloqueada && (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={activa}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-[15px] font-semibold ${
        activa ? "border-[#d0cec8] text-text-muted" : "border-primary text-primary"
      }`}
    >
      {activa ? "Sacar" : "Sumar"}
    </button>
  );

  return (
    <SeccionForm titulo={titulo} descripcion={descripcion} derecha={boton || undefined}>
      {activa && <div className="flex flex-col gap-5">{children}</div>}
    </SeccionForm>
  );
}

export function ListaProblemas({ problemas }: { problemas: ProblemaCarga[] }) {
  if (problemas.length === 0) return null;
  return (
    <ul role="alert" className="flex flex-col gap-1.5">
      {problemas.map((p, i) => (
        <li key={i}>
          <MensajeError>{p.mensaje}</MensajeError>
        </li>
      ))}
    </ul>
  );
}

export function FilaResumen({
  label,
  valor,
  fuerte = false,
}: {
  label: string;
  valor: ReactNode;
  fuerte?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "text-base font-medium" : ""}`}>
      <span className="min-w-0 text-text-muted">{label}</span>
      <span className="shrink-0 text-right tabular-nums text-text">{valor}</span>
    </div>
  );
}
