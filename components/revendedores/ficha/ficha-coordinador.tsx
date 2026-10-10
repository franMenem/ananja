import Link from "next/link";

import { BotellasAdeudadas } from "@/components/revendedores/botellas-adeudadas";
import { EntregasCoordinadora } from "@/components/revendedores/ficha/entregas-coordinadora";
import type { ResumenBotellas } from "@/lib/dominio/botellas-adeudadas";
import type { RevendedoraCoordinador } from "@/lib/dominio/coordinador";
import type { EntregasCoordinadora as Entregas } from "@/lib/dominio/entregas-coordinador";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";

export type FichaCoordinadorProps = {
  revendedoras: RevendedoraCoordinador[];
  /** Lo que este coordinador tiene que pasar a la cuenta de Ananja
   * (`v_plata_en_manos.total_centavos`, 0057) — desde 0058, YA es solo la
   * parte Ananja de lo que le rindieron sus revendedoras, sin su margen
   * propio (que no se muestra en ningún lado). */
  plataEnManoCentavos: number;
  /** Entregas y devoluciones a sus revendedoras a cargo; `null` si la
   * lectura falló. */
  entregas: Entregas | null;
  /** Botellas que se le deben a Ananja entre sus revendedoras a cargo y la
   * plata que cobró sin pasar (`cargarBotellasAdeudadas`); `null` si la
   * lectura falló. */
  botellas: ResumenBotellas | null;
};

/**
 * Cuerpo de la ficha de un coordinador (`/revendedores/[id]`,
 * 0057_coordinador_plata_stock.sql § hueco de navegación: antes de esto no
 * había forma de llegar acá). Reemplaza los bloques de una revendedora
 * (Acciones, En poder, Pagos, Movimientos, Ganancia) — ninguno le
 * corresponde: un coordinador no compra ni vende, solo reparte y cobra por
 * cuenta de {NEGOCIO.nombre}. Muestra en cambio lo que sí es suyo: sus
 * revendedoras a cargo (mismos números que ve él en `/mi`,
 * `armarRevendedorasCoordinador`) y cuánto tiene que pasar a la cuenta de
 * Ananja (0058: no es lo mismo que "tiene en mano" — puede tener más si
 * cobra con margen propio) y las entregas que les hizo, con su lote
 * (`EntregasCoordinadora`) y cuántas botellas se le deben a Ananja entre su
 * equipo y lo que cobró (`BotellasAdeudadas`) — el botón de cambio de rol ya vive en
 * `CabeceraFicha`, arriba de este bloque.
 */
export function FichaCoordinador({ revendedoras, plataEnManoCentavos, entregas, botellas }: FichaCoordinadorProps) {
  return (
    <div className="flex flex-col gap-8">
      {plataEnManoCentavos > 0 && (
        <div className="flex flex-col gap-1 border-b border-border pb-6">
          <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
            Tiene que pasar a {NEGOCIO.nombre}
          </span>
          <p className="font-display text-[40px] leading-[1.05] whitespace-nowrap text-primary">
            {formatCentavos(plataEnManoCentavos)}
          </p>
          <p className="text-[12px] text-text-muted">
            Todavía no la pasó a la cuenta de {NEGOCIO.nombre}.
          </p>
        </div>
      )}

      <BotellasAdeudadas
        resumen={botellas}
        variante="equipo"
        nota="Entre sus revendedoras y la plata que cobró."
      />

      <section className="flex flex-col gap-3">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Revendedoras a cargo ({revendedoras.length})
        </span>

        {revendedoras.length === 0 ? (
          <p className="py-6 text-sm text-text-muted">Todavía no tiene ninguna revendedora asignada.</p>
        ) : (
          <div className="flex flex-col gap-px border border-border bg-border">
            {revendedoras.map((r) => (
              <Link
                key={r.id}
                href={`/revendedores/${r.id}`}
                className="flex items-baseline justify-between gap-3 bg-surface-raised p-3.5 hover:bg-border/30"
              >
                <span className="min-w-0 break-words font-medium text-text">{r.nombre}</span>
                <span className="flex shrink-0 items-baseline gap-3 text-[12px]">
                  <span className="text-text-muted">
                    {r.enPoder} {envase(r.enPoder)}
                    {r.valorEnPoderCentavos > 0 && ` · ${formatCentavos(r.valorEnPoderCentavos)} en poder`}
                  </span>
                  <span className="font-display text-[16px] leading-none text-accent tabular-nums">
                    {formatCentavos(r.debeCentavos)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <EntregasCoordinadora entregas={entregas} />
    </div>
  );
}
