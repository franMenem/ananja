"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { decimalesDeTipo, resolverCampoNumerico, type TipoCampoNumerico } from "@/lib/dominio/campo-numerico";

type MontoInputProps = {
  /** `id` del `<input>` (para el `htmlFor` del rótulo). Si falta, se genera uno. */
  id?: string;
  /** Rótulo visible. Si no hay, pasar `ariaLabel` (o un `<label htmlFor>` propio). */
  label?: ReactNode;
  ariaLabel?: string;
  /** Texto tal cual lo escribe el usuario — el formulario lo parsea al guardar
   * con `parseMontoInput`/`parsePorcentaje`/`parseCantidadInput`/`parseEnteroInput`,
   * que ya entienden cuentas. Algo escrito que no se entiende tiene que frenar
   * el guardado (`campoNumericoInvalido`), nunca tratarse como vacío. */
  value: string;
  onChange: (value: string) => void;
  /** Qué reglas de parseo y formato usar (ver `lib/campo-numerico.ts`). Default "monto". */
  tipo?: TipoCampoNumerico;
  /** Símbolo antes del número ("$", "USD"). Default "$" en montos, nada en el resto. `null` lo oculta. */
  simbolo?: string | null;
  /** Símbolo después del número ("%"). */
  sufijo?: string | null;
  hint?: ReactNode;
  /** Error del formulario para este campo. Si hay, reemplaza los avisos propios del campo. */
  error?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Campo secundario más chico (rótulo 9px, alto 40px) — mismo criterio que el viejo `MoneyField`. */
  small?: boolean;
  /** Rótulo a la izquierda y campo a la derecha en la misma fila (precio por botella). */
  labelEnLinea?: boolean;
  /** Un número suelto con más decimales de los que se guardan ("12,345" en
   * un monto) NO se redondea al salir: queda escrito y se avisa (precio
   * unitario de una factura). Una cuenta se redondea igual. */
  exigirExacto?: boolean;
  /** Clases para igualar el estilo de cada pantalla. Si se pasan, REEMPLAZAN
   * las de por defecto (caja con borde, 48px de alto, texto 16px). */
  className?: string;
  labelClassName?: string;
  cajaClassName?: string;
  inputClassName?: string;
  simboloClassName?: string;
  onBlur?: () => void;
};

const OPERACIONES = [
  { texto: "+", insertar: "+", etiqueta: "Sumar" },
  { texto: "−", insertar: "-", etiqueta: "Restar" },
  { texto: "×", insertar: "×", etiqueta: "Multiplicar" },
  { texto: "÷", insertar: "÷", etiqueta: "Dividir" },
  { texto: "(", insertar: "(", etiqueta: "Abrir paréntesis" },
  { texto: ")", insertar: ")", etiqueta: "Cerrar paréntesis" },
] as const;

type Linea = { texto: string; tono: "neutro" | "error" };

// --- Salir del campo con un toque -------------------------------------------
// Al tocar "Guardar" justo debajo, el campo pierde el foco en el pointerdown
// (o en el touchend, en iOS) y, si en ese momento desaparecen la línea del
// resultado y la fila de operaciones, el botón se corre y el click cae en
// otro lado. Por eso, cuando la salida viene de un toque, lo que se muestra
// debajo queda congelado (misma altura) hasta que el click ya se despachó.

let punteroAbajo = false;
let ultimoSoltarMs = -Infinity;
let escuchandoPuntero = false;

function escucharPuntero() {
  if (escuchandoPuntero || typeof window === "undefined") return;
  escuchandoPuntero = true;
  window.addEventListener("pointerdown", () => {
    punteroAbajo = true;
  }, true);
  const soltar = () => {
    punteroAbajo = false;
    ultimoSoltarMs = performance.now();
  };
  window.addEventListener("pointerup", soltar, true);
  window.addEventListener("pointercancel", soltar, true);
}

function salidaPorToque(): boolean {
  return punteroAbajo || performance.now() - ultimoSoltarMs < 600;
}

/** Llama a `fn` en el frame siguiente al click del toque en curso (o, si no
 * llega ningún click, un rato después de soltar). Devuelve cómo cancelarlo. */
function despuesDelToque(fn: () => void): () => void {
  let cancelado = false;
  let listo = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const terminar = () => {
    if (listo) return;
    listo = true;
    clearTimeout(timer);
    window.removeEventListener("click", alClick, true);
    window.removeEventListener("pointerup", alSoltar, true);
    window.removeEventListener("pointercancel", alSoltar, true);
    // Un frame después (setTimeout y no requestAnimationFrame: rAF se frena
    // con la pestaña oculta y el campo quedaría congelado).
    setTimeout(() => {
      if (!cancelado) fn();
    }, 16);
  };
  // En la fase de captura del click todavía no corrieron los handlers del
  // botón: se espera a que termine esa tarea.
  const alClick = () => setTimeout(terminar, 0);
  const alSoltar = () => {
    clearTimeout(timer);
    timer = setTimeout(terminar, 400);
  };

  window.addEventListener("click", alClick, true);
  if (punteroAbajo) {
    window.addEventListener("pointerup", alSoltar, true);
    window.addEventListener("pointercancel", alSoltar, true);
    timer = setTimeout(terminar, 5000);
  } else {
    timer = setTimeout(terminar, 400);
  }

  return () => {
    cancelado = true;
    terminar();
  };
}

/**
 * Campo de montos, porcentajes y cantidades con cuentas — el ÚNICO campo
 * numérico de escritura libre de la app. "." y "," valen igual como decimal
 * y se puede escribir "150000+50000" o "(80000+20000)*1,21"
 * (reglas en `lib/calculo-monto.ts`):
 * - Mientras hay una cuenta (o separadores que se podrían leer de dos
 *   maneras, como "12.345"), muestra debajo cómo se interpretó: "= $ 100.000,00".
 *   Al salir, algo que no se entiende queda marcado en rojo ("Cuenta
 *   incompleta", "Número inválido").
 * - Al salir del campo (o con Enter / "="), reemplaza el texto por el
 *   resultado formateado. Enter con una cuenta sin resolver la resuelve en
 *   vez de mandar el formulario.
 * - En pantallas táctiles, mientras está enfocado, muestra una fila de
 *   botones + − × ÷ ( ) = (el teclado numérico del celular no los tiene)
 *   que escriben donde está el cursor sin sacarle el foco al campo.
 * - Para lectores de pantalla, el resultado se anuncia cuando el usuario
 *   hace una pausa o resuelve la cuenta, no en cada tecla.
 */
export function MontoInput({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  tipo = "monto",
  simbolo,
  sufijo = null,
  hint,
  error,
  placeholder,
  required,
  disabled,
  autoFocus,
  small = false,
  labelEnLinea = false,
  exigirExacto = false,
  className,
  labelClassName,
  cajaClassName,
  inputClassName,
  simboloClassName,
  onBlur,
}: MontoInputProps) {
  const idGenerado = useId();
  const inputId = id ?? idGenerado;
  const resultadoId = `${inputId}-resultado`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const inputRef = useRef<HTMLInputElement>(null);
  const cursorPendiente = useRef<number | null>(null);
  const cancelarSalida = useRef<(() => void) | null>(null);
  const [enfocado, setEnfocado] = useState(false);
  // Salida por toque en curso: lo de abajo queda como estaba (ver `despuesDelToque`).
  const [congelado, setCongelado] = useState<{ linea: Linea | null } | null>(null);
  const [anuncio, setAnuncio] = useState("");

  useEffect(() => {
    escucharPuntero();
    return () => cancelarSalida.current?.();
  }, []);

  // Después de insertar un operador, deja el cursor justo después de lo insertado.
  useLayoutEffect(() => {
    const posicion = cursorPendiente.current;
    if (posicion === null || !inputRef.current) return;
    cursorPendiente.current = null;
    inputRef.current.setSelectionRange(posicion, posicion);
  });

  const simboloEfectivo = simbolo === undefined ? (tipo === "monto" ? "$" : null) : simbolo;
  const estado = resolverCampoNumerico(value, tipo);
  const inexacto =
    exigirExacto && estado.estado === "valido" && !estado.esCuenta && !estado.exacto;

  function textoResultado(textoFormateado: string): string {
    return ["=", simboloEfectivo, textoFormateado, sufijo].filter(Boolean).join(" ");
  }

  function calcularLinea(conFoco: boolean): Linea | null {
    if (estado.estado === "valido") {
      if (inexacto) {
        return error
          ? null
          : { texto: `Admite hasta ${decimalesDeTipo(tipo)} decimales`, tono: "error" };
      }
      return estado.mostrarResultado
        ? { texto: textoResultado(estado.textoFormateado), tono: "neutro" }
        : null;
    }
    if (estado.estado === "invalido" && !error) {
      if (!conFoco) return { texto: estado.mensajeAlSalir, tono: "error" };
      return estado.mensaje
        ? { texto: estado.mensaje, tono: estado.motivo === "incompleta" ? "neutro" : "error" }
        : null;
    }
    return null;
  }

  const lineaActual = calcularLinea(enfocado);
  const linea = congelado ? congelado.linea : lineaActual;
  const textoLinea = linea?.texto ?? "";

  // Anuncio para lectores de pantalla: recién tras una pausa al escribir.
  useEffect(() => {
    const timer = setTimeout(() => setAnuncio(textoLinea), enfocado ? 1000 : 50);
    return () => clearTimeout(timer);
  }, [textoLinea, enfocado]);

  function resolver(): boolean {
    const actual = resolverCampoNumerico(value, tipo);
    if (actual.estado !== "valido") return false;
    if (exigirExacto && !actual.esCuenta && !actual.exacto) return false;
    if (actual.textoFormateado !== value) {
      cursorPendiente.current = actual.textoFormateado.length;
      onChange(actual.textoFormateado);
      if (actual.esCuenta) setAnuncio(textoResultado(actual.textoFormateado));
    }
    return true;
  }

  function insertar(texto: string) {
    const el = inputRef.current;
    const inicio = el?.selectionStart ?? value.length;
    const fin = el?.selectionEnd ?? value.length;
    cursorPendiente.current = inicio + texto.length;
    onChange(value.slice(0, inicio) + texto + value.slice(fin));
  }

  function handleFocus() {
    cancelarSalida.current?.();
    cancelarSalida.current = null;
    setCongelado(null);
    setEnfocado(true);
  }

  function handleBlur() {
    const lineaAntes = lineaActual;
    setEnfocado(false);
    resolver();
    onBlur?.();
    if (salidaPorToque()) {
      setCongelado({ linea: lineaAntes });
      cancelarSalida.current?.();
      cancelarSalida.current = despuesDelToque(() => {
        cancelarSalida.current = null;
        setCongelado(null);
      });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "=") {
      event.preventDefault();
      resolver();
      return;
    }
    if (event.key !== "Enter" || estado.estado === "vacio" || !estado.esCuenta) return;
    // Primer Enter: resuelve la cuenta (o avisa que está mal) sin mandar el
    // formulario; el segundo, ya con el resultado a la vista, lo manda.
    event.preventDefault();
    resolver();
  }

  const cuentaInvalida = lineaActual?.tono === "error";
  const describedBy =
    [linea && resultadoId, hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  const claseSimbolo = simboloClassName ?? "text-text-muted";
  // La fila de operaciones sigue montada (invisible, misma altura) mientras
  // dura la salida por toque.
  const mostrarFila = !disabled && (enfocado || congelado !== null);

  const rotulo = label ? (
    <label
      htmlFor={inputId}
      className={
        labelClassName ??
        `block break-words tracking-[0.18em] text-text-muted uppercase ${small ? "text-[9px]" : "text-[10px]"}`
      }
    >
      {label}
    </label>
  ) : null;

  const caja = (
    <div className={cajaClassName ?? "mt-1.5 flex items-center gap-2 border border-border bg-surface px-3"}>
      {simboloEfectivo && <span className={claseSimbolo}>{simboloEfectivo}</span>}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode={tipo === "entero" ? "numeric" : "decimal"}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label ? undefined : ariaLabel}
        aria-invalid={cuentaInvalida || Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={
          inputClassName ??
          `w-full min-w-0 bg-transparent text-text focus:outline-none ${small ? "min-h-10 text-base" : "min-h-12 text-base"}`
        }
      />
      {sufijo && <span className={claseSimbolo}>{sufijo}</span>}
    </div>
  );

  return (
    <div className={className}>
      {labelEnLinea ? (
        <div className="flex items-center justify-between gap-3">
          {rotulo}
          {caja}
        </div>
      ) : (
        <>
          {rotulo}
          {caja}
        </>
      )}

      {/* Anuncio para lectores de pantalla (absoluto: no ocupa lugar ni hueco de gap). */}
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>

      {linea && (
        <p
          id={resultadoId}
          className={`mt-1 text-[12px] leading-snug break-words tabular-nums ${
            linea.tono === "error" ? "text-accent" : "text-text-muted"
          }`}
        >
          {linea.texto}
        </p>
      )}

      {mostrarFila && (
        <div
          className={`@container mt-1.5 hidden pointer-coarse:block ${enfocado ? "" : "invisible"}`}
        >
          <div
            role="group"
            aria-label="Operaciones"
            className="grid grid-cols-4 gap-px border border-border bg-border @[17rem]:grid-cols-7"
          >
            {OPERACIONES.map((op) => (
              <button
                key={op.texto}
                type="button"
                tabIndex={-1}
                aria-label={op.etiqueta}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertar(op.insertar)}
                className="min-h-11 bg-surface-raised text-lg text-text active:bg-surface"
              >
                {op.texto}
              </button>
            ))}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Calcular resultado"
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => resolver()}
              className="col-span-2 min-h-11 bg-primary text-lg text-background @[17rem]:col-span-1"
            >
              =
            </button>
          </div>
        </div>
      )}

      {hint && (
        <p id={hintId} className="mt-1 text-[11px] leading-snug text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[11px] leading-snug text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
