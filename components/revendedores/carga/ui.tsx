import type { ReactNode } from "react";

import type { ProblemaCarga } from "@/lib/dominio/carga-revendedor";

/** Estilos compartidos por los campos de las tres secciones de `CargaForm`. */
export const ROTULO = "text-[10px] tracking-[0.18em] text-text-muted uppercase";
export const CAMPO =
  "mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary";
export const CAJA_MONTO =
  "mt-1.5 flex items-center border border-border bg-surface px-3 focus-within:border-primary";
export const INPUT_MONTO =
  "min-h-12 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none";
export const LINK_CHICO = "min-h-9 text-[11px] font-medium tracking-[0.12em] uppercase";

/** Una de las tres partes plegables de `CargaForm` (Entrega, Ventas, Pago):
 * cabecera con número/título/descripción y un botón Sumar/Sacar, contenido
 * solo montado mientras está activa. */
export function Seccion({
  numero,
  titulo,
  descripcion,
  activa,
  bloqueada = false,
  onToggle,
  children,
}: {
  numero: number;
  titulo: string;
  descripcion: ReactNode;
  activa: boolean;
  bloqueada?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col border border-border">
      <button
        type="button"
        onClick={onToggle}
        disabled={bloqueada}
        aria-expanded={activa}
        className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-[20px] text-primary">
            {numero} · {titulo}
          </span>
          <span className="text-[12px] leading-snug text-text-muted">{descripcion}</span>
        </span>
        {!bloqueada && (
          <span
            className={`shrink-0 border px-3 py-2 text-[12px] font-medium tracking-[0.12em] uppercase ${
              activa ? "border-border text-text-muted" : "border-primary text-primary"
            }`}
          >
            {activa ? "Sacar" : "Sumar"}
          </span>
        )}
      </button>
      {activa && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">{children}</div>
      )}
    </section>
  );
}

export function ListaProblemas({ problemas }: { problemas: ProblemaCarga[] }) {
  if (problemas.length === 0) return null;
  return (
    <ul role="alert" className="flex flex-col gap-1 text-sm text-accent">
      {problemas.map((p, i) => (
        <li key={i}>{p.mensaje}</li>
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
