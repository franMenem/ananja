/**
 * Indicador de "trabajando" de la app: un arco fino que gira, en el color
 * del texto que lo rodea (`currentColor`) y del tamaño de la letra (`1em`),
 * así sirve igual sobre un botón oliva que sobre uno con borde. Con
 * "reducir movimiento" activado no gira: queda el arco quieto junto al texto
 * de carga. Lo usa `BotonAccion` (`components/boton-accion.tsx`).
 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={`h-[1em] w-[1em] shrink-0 animate-spin motion-reduce:animate-none ${className}`}
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
