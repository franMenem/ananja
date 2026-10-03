"use client";

type CantidadStepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** Cota inferior (inclusive). Default 0. */
  min?: number;
  /** Cota superior (inclusive). Sin tope si se omite. */
  max?: number;
  /**
   * Sufijo para los `aria-label` de los botones "−"/"+" y del input
   * (`Restar una unidad${sufijo}` / `Sumar una unidad${sufijo}` /
   * `Cantidad${sufijo}`), p. ej. " de Botella 250 ml" cuando hay varios
   * steppers en la misma pantalla (uno por producto). Vacío por default (un
   * solo stepper en la pantalla).
   */
  ariaLabelSufijo?: string;
  /** Reemplaza el `aria-label` completo del botón "−" (default: `Restar una unidad${ariaLabelSufijo}`). */
  ariaLabelRestar?: string;
  /** Reemplaza el `aria-label` completo del botón "+" (default: `Sumar una unidad${ariaLabelSufijo}`). */
  ariaLabelSumar?: string;
  /** Tamaño de los botones y del valor: "md" (46px, default) o "sm" (42px). */
  size?: "sm" | "md";
  /**
   * Si es `false`, el valor se muestra como texto no editable (ej.
   * comprobante-form) en lugar de un `<input>` numérico. Default `true`.
   */
  editable?: boolean;
  /**
   * Si es `false`, el botón "−" nunca se deshabilita al llegar al mínimo
   * (comportamiento previo de lote-form, entrega-form y movimiento-form).
   * Default `true`.
   */
  disableAtMin?: boolean;
};

const DIMENSIONES = {
  md: {
    boton: "h-[46px] w-[46px]",
    textoBoton: "text-xl",
    valorAncho: "w-[52px]",
    valorTexto: "text-[26px]",
  },
  sm: {
    boton: "h-[42px] w-[42px]",
    textoBoton: "text-lg",
    valorAncho: "w-[48px]",
    valorTexto: "text-[20px]",
  },
} as const;

/**
 * Stepper táctil "−  valor  +" — antes duplicado en
 * `components/stock/lote-form.tsx`, `components/revendedores/entrega-form.tsx`,
 * `components/comprobante-form.tsx` y `components/stock/movimiento-form.tsx`,
 * cada uno con pequeñas variaciones (tamaño, si el valor es editable o solo
 * texto, si el botón "−" se deshabilita al llegar al mínimo). Esas variaciones
 * se exponen acá como props (`size`, `editable`, `disableAtMin`) en vez de
 * duplicar el componente, para no cambiar el comportamiento ni el aspecto de
 * ninguna de las copias originales.
 */
export function CantidadStepper({
  value,
  onChange,
  min = 0,
  max,
  ariaLabelSufijo = "",
  ariaLabelRestar,
  ariaLabelSumar,
  size = "md",
  editable = true,
  disableAtMin = true,
}: CantidadStepperProps) {
  function clamp(n: number): number {
    const conMinimo = Math.max(min, n);
    return max !== undefined ? Math.min(max, conMinimo) : conMinimo;
  }

  const dim = DIMENSIONES[size];
  const colorResta = editable ? "text-text" : "text-primary";
  const anchoFijo = editable ? " shrink-0" : "";
  const restaDeshabilitada = disableAtMin && value <= min;
  const sumaDeshabilitada = max !== undefined && value >= max;

  return (
    <div className="flex w-fit items-center border border-border">
      <button
        type="button"
        aria-label={ariaLabelRestar ?? `Restar una unidad${ariaLabelSufijo}`}
        onClick={() => onChange(clamp(value - 1))}
        disabled={restaDeshabilitada}
        className={`flex ${dim.boton}${anchoFijo} items-center justify-center border-r border-border ${dim.textoBoton} ${colorResta} disabled:opacity-45`}
      >
        −
      </button>
      {editable ? (
        <input
          inputMode="numeric"
          aria-label={`Cantidad${ariaLabelSufijo}`}
          value={value}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            onChange(Number.isFinite(parsed) ? clamp(parsed) : min);
          }}
          className={`font-display h-[46px] ${dim.valorAncho} shrink-0 bg-transparent text-center ${dim.valorTexto} text-primary tabular-nums`}
        />
      ) : (
        <span
          className={`font-display ${dim.valorAncho} text-center ${dim.valorTexto} text-primary tabular-nums`}
        >
          {value}
        </span>
      )}
      <button
        type="button"
        aria-label={ariaLabelSumar ?? `Sumar una unidad${ariaLabelSufijo}`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={sumaDeshabilitada}
        className={`flex ${dim.boton}${anchoFijo} items-center justify-center bg-primary ${dim.textoBoton} text-background disabled:opacity-45`}
      >
        +
      </button>
    </div>
  );
}
