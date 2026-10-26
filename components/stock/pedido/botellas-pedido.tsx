import Link from "next/link";
import type { ReactNode } from "react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { formatProductosEnManos, type PersonaEnManos } from "@/lib/dominio/lote-en-manos";
import type { CobranzaPedido } from "@/lib/dominio/pedidos-lote";
import { formatCentavos } from "@/lib/money";

type BotellasPedidoProps = {
  cobranza: CobranzaPedido;
  personasEnManos: PersonaEnManos[];
  totalEnManos: number;
};

function Linea({ etiqueta, valor, sub }: { etiqueta: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline justify-between gap-3 text-[16px]">
        <span className="text-text">{etiqueta}</span>
        <span className="font-semibold text-text tabular-nums">{valor}</span>
      </div>
      {sub}
    </div>
  );
}

/**
 * Tarjeta "Botellas" del detalle de un pedido: cuántas se produjeron, cuántas
 * se vendieron y dónde están las que quedan (depósito / en manos de cada
 * revendedora) — todo SUMADO entre las presentaciones del pedido (el desglose
 * por presentación vive en "Costo por botella").
 */
export function BotellasPedido({ cobranza, personasEnManos, totalEnManos }: BotellasPedidoProps) {
  return (
    <Tarjeta como="section" aria-labelledby="pedido-botellas" className="flex flex-col gap-1">
      <h2 id="pedido-botellas" className="text-[20px] leading-tight font-semibold text-text">
        Botellas
      </h2>
      <div className="flex flex-col divide-y divide-line">
        <Linea etiqueta="Producidas" valor={cobranza.producidas} />
        <Linea etiqueta="Vendidas" valor={cobranza.vendidas} />
        <Linea etiqueta="En depósito" valor={cobranza.enDeposito} />
        <Linea
          etiqueta="En revendedoras"
          valor={totalEnManos}
          sub={
            personasEnManos.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-0.5">
                {personasEnManos.map((persona) => (
                  <div
                    key={persona.vendedorId}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]"
                  >
                    <Link
                      prefetch={false}
                      href={`/revendedores/${persona.vendedorId}`}
                      className="inline-flex min-h-11 min-w-0 items-center break-words text-primary underline decoration-mark underline-offset-4"
                    >
                      {persona.nombre}
                    </Link>
                    <span className="text-text-muted tabular-nums">{formatProductosEnManos(persona.productos)}</span>
                  </div>
                ))}
              </div>
            )
          }
        />
        {cobranza.perdidas > 0 && <Linea etiqueta="Pérdidas" valor={cobranza.perdidas} />}
        {cobranza.esperadoTotalCentavos > 0 && (
          <Linea
            etiqueta="Tiene que entrar por lo vendido"
            valor={formatCentavos(cobranza.esperadoPorVendidasCentavos)}
            sub={
              <span className="text-[14px] text-text-muted tabular-nums">
                si se vende todo {formatCentavos(cobranza.esperadoTotalCentavos)}
              </span>
            }
          />
        )}
      </div>
    </Tarjeta>
  );
}
