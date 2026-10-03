/**
 * Separador de etiqueta con línea, con un total opcional a la derecha
 * (bloque "Le deben a Ananja" de `/plata`) — compartido por
 * `components/plata/{le-deben,ananja-debe}.tsx` y por el bloque "Últimos
 * movimientos" de `app/(app)/plata/page.tsx`.
 */
export function Separador({ titulo, total }: { titulo: string; total?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 pb-3">
      <span className="shrink-0 text-[10px] tracking-[0.22em] text-text-muted uppercase">
        {titulo}
      </span>
      <span
        className="h-px flex-1"
        style={{ background: "linear-gradient(to right, var(--color-border), transparent)" }}
      />
      {total !== undefined && (
        <span className="shrink-0 text-lg font-medium tabular-nums text-accent">{total}</span>
      )}
    </div>
  );
}
