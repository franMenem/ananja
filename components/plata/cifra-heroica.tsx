import { formatCentavos } from "@/lib/money";

/** Cifra heroica sobre fondo claro: enteros grandes + centavos en gris. */
export function CifraHeroica({ centavos, className = "" }: { centavos: number; className?: string }) {
  const [entero, decimales] = formatCentavos(centavos).split(",");
  return (
    <span className={`tabular-nums ${className}`}>
      {entero}
      <span className="text-text-muted">,{decimales}</span>
    </span>
  );
}
