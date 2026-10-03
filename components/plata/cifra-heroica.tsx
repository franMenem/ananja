import { formatCentavos } from "@/lib/money";

/** Cifra heroica sobre oliva: enteros grandes + centavos en `--color-primary-2`. */
export function CifraHeroica({ centavos, className = "" }: { centavos: number; className?: string }) {
  const [entero, decimales] = formatCentavos(centavos).split(",");
  return (
    <span className={`tabular-nums ${className}`}>
      {entero}
      <span className="text-primary-2">,{decimales}</span>
    </span>
  );
}
