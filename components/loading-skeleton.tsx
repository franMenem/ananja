/**
 * Skeleton genérico para los `loading.tsx` de las pantallas principales:
 * esqueleto reglado (design/handoff README § Estado de carga) — filas con un bloque de
 * 52×52px y dos barras, separadas por un filete, desvaneciéndose hacia
 * abajo. Server component simple, sin estado — solo se muestra un instante
 * durante la navegación.
 */

// Opacidad decreciente por fila, tope en la última definida (README: 1, 1,
// 1, 0.55, 0.3 — se repite el último valor si hay más filas).
const OPACIDADES = [1, 1, 1, 0.55, 0.3];

export function ListaSkeleton({ filas = 4 }: { filas?: number }) {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-2.5 pb-3">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Cargando
        </span>
        <span
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(to right, var(--color-border), transparent)",
          }}
        />
      </div>

      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border py-3.5"
          style={{ opacity: OPACIDADES[Math.min(i, OPACIDADES.length - 1)] }}
        >
          <div className="h-[52px] w-[52px] shrink-0 bg-surface-raised" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-[22px] w-[60%] bg-surface-raised" />
            <div className="h-[11px] w-[45%] bg-surface-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}
