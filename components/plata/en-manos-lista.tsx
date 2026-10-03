import Link from "next/link";

import { formatCentavos } from "@/lib/money";

type PersonaEnManos = {
  tenedor_id: string;
  nombre: string;
  total_centavos: number;
};

function desdeTexto(dias: number): string {
  if (dias <= 0) return "desde hoy";
  if (dias === 1) return "desde hace 1 día";
  return `desde hace ${dias} días`;
}

/**
 * Bloque 2 de `/plata` — una fila por persona con plata en mano, sin
 * repetir el título "En manos de" (ya está en la cifra oliva de arriba).
 * Maneja negativo (dato roto, sin botón de depositar) y el aviso de
 * "efectivo sin dueño" — mismo criterio que tenía `/caja`.
 */
export function EnManosLista({
  personas,
  diasPorPersona,
  efectivoSinDueno,
}: {
  personas: PersonaEnManos[];
  diasPorPersona: Map<string, number | null>;
  efectivoSinDueno: number;
}) {
  return (
    <div className="flex flex-col pt-6 md:pt-0">
      {personas.length === 0 ? (
        <p className="py-3 text-sm text-text-muted">Nadie tiene plata en mano.</p>
      ) : (
        personas.map((p) => {
          const dias = diasPorPersona.get(p.tenedor_id);
          const negativo = p.total_centavos < 0;
          return (
            <div key={p.tenedor_id} className="flex flex-col gap-2 border-b border-border py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/plata/en-manos/${p.tenedor_id}`}
                  className="min-w-0 break-words text-[15px] text-text underline decoration-border underline-offset-4 hover:text-primary"
                >
                  {p.nombre}
                </Link>
                <span
                  className={`font-display shrink-0 text-[24px] leading-[1] tabular-nums ${
                    negativo ? "text-accent" : "text-primary"
                  }`}
                >
                  {formatCentavos(p.total_centavos)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[11px]">
                <span className="text-text-muted">
                  {negativo
                    ? "Figura en negativo: revisá sus movimientos."
                    : dias !== null && dias !== undefined
                      ? `La tiene ${desdeTexto(dias)}`
                      : " "}
                </span>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/plata/en-manos/${p.tenedor_id}`}
                    className="border-b border-mark text-[11px] tracking-[0.06em] text-text uppercase"
                  >
                    Ver movimientos
                  </Link>
                  {!negativo && (
                    <Link
                      href={`/plata/depositar?tenedor=${p.tenedor_id}&monto=${p.total_centavos}`}
                      className="flex min-h-11 items-center justify-center bg-primary px-3.5 text-[11px] font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
                    >
                      Pasar a la cuenta
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
      {efectivoSinDueno !== 0 && (
        <p className="pt-3 text-[12px] leading-relaxed text-text-muted">
          Además hay {formatCentavos(efectivoSinDueno)} en efectivo que no figura en manos de
          ningún admin (saldo inicial de efectivo o ventas en efectivo de alguien que no es
          admin). Está incluido en el total.
        </p>
      )}
    </div>
  );
}
