import {
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Base común de los formularios (fase 8 del rediseño). Un solo lugar para
 * el tamaño y el aspecto de las etiquetas, las ayudas, los errores y los
 * campos, así todas las pantallas se piden igual:
 *
 * - etiqueta 15px/600 arriba del campo;
 * - ayuda 14px gris debajo;
 * - error 14px rojo debajo, con ícono, `aria-invalid` y `aria-describedby`;
 * - campos de 48px de alto o más, texto de 16px (evita el zoom de iOS),
 *   esquinas redondeadas, borde #D0CEC8 y anillo naranja al enfocar.
 *
 * No guarda ni valida nada: solo presenta.
 */

/** Etiqueta de un campo: 15px, 600, arriba. */
export const CLASE_ETIQUETA = "block text-[15px] font-semibold text-text";
/** Ayuda de un campo: 14px, gris, debajo. */
export const CLASE_AYUDA = "text-[14px] leading-snug text-text-muted";
/** Mensaje de error: 14px, rojo, con ícono delante. */
export const CLASE_ERROR = "flex items-start gap-1.5 text-[14px] leading-snug text-accent";

const FOCO = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

/** Input / select: 48px de alto mínimo, 16px, rounded-xl, borde #D0CEC8. */
export const CLASE_ENTRADA = `min-h-12 w-full rounded-xl border border-[#d0cec8] bg-surface px-3 text-[16px] text-text placeholder:text-text-muted aria-[invalid=true]:border-accent ${FOCO}`;
/** Textarea: igual que el input pero con padding vertical y más alto. */
export const CLASE_AREA_TEXTO = `min-h-24 w-full rounded-xl border border-[#d0cec8] bg-surface px-3 py-3 text-[16px] text-text placeholder:text-text-muted aria-[invalid=true]:border-accent ${FOCO}`;
/** Caja que envuelve a un `MontoInput` (el input va adentro, sin borde). */
export const CLASE_CAJA_MONTO =
  "mt-1.5 flex min-h-12 items-center gap-2 rounded-xl border border-[#d0cec8] bg-surface px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30";
export const CLASE_INPUT_EN_CAJA =
  "min-h-12 w-full min-w-0 bg-transparent text-[16px] text-text tabular-nums focus:outline-none";

/** El importe principal de una pantalla (gasto, pago, venta): más grande,
 * dentro de la misma caja de siempre. */
export const CLASE_INPUT_MONTO_GRANDE =
  "min-h-14 w-full min-w-0 bg-transparent text-[28px] font-semibold leading-none text-text tabular-nums focus:outline-none";
export const CLASE_SIMBOLO_MONTO_GRANDE = "text-[22px] text-text-muted";

export function IconoAviso({ className = "mt-0.5 h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v5M10 14h.01" />
    </svg>
  );
}

/** Error de formulario o de campo: 14px, rojo, ícono y `role="alert"`. */
export function MensajeError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className={CLASE_ERROR}>
      <IconoAviso />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** Las props de accesibilidad de un control dentro de un `Campo`. */
export function ariaCampo(id: string, { ayuda, error }: { ayuda?: ReactNode; error?: ReactNode }) {
  const describedBy = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy || undefined,
  };
}

type CampoProps = {
  /** `id` del control (lo usa el `htmlFor` de la etiqueta). */
  id: string;
  etiqueta: ReactNode;
  /** Agrega " (opcional)" al lado de la etiqueta. */
  opcional?: boolean;
  ayuda?: ReactNode;
  error?: ReactNode;
  className?: string;
  /** Un solo control (input, select, textarea…): recibe `id`, `aria-invalid`
   * y `aria-describedby`. */
  children: ReactNode;
};

/**
 * Un campo de formulario: etiqueta arriba, el control, la ayuda y el error
 * debajo. Si `children` es un único elemento, le pone `id`, `aria-invalid` y
 * `aria-describedby`; para controles armados a mano, usar `ariaCampo`.
 */
export function Campo({ id, etiqueta, opcional = false, ayuda, error, className = "", children }: CampoProps) {
  const aria = ariaCampo(id, { ayuda, error });
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, aria)
    : children;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
        {opcional && <span className="font-normal text-text-muted"> (opcional)</span>}
      </label>
      {control}
      {ayuda && (
        <p id={`${id}-ayuda`} className={CLASE_AYUDA}>
          {ayuda}
        </p>
      )}
      {error && <MensajeError id={`${id}-error`}>{error}</MensajeError>}
    </div>
  );
}

export function Entrada({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${CLASE_ENTRADA} ${className}`} />;
}

export function Selector({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`${CLASE_ENTRADA} ${className}`} />;
}

export function AreaTexto({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${CLASE_AREA_TEXTO} ${className}`} />;
}
