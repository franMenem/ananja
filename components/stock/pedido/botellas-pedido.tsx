import Link from "next/link";

import { Separador } from "@/components/plata/separador";
import type { CobranzaPedido } from "@/lib/dominio/pedidos-lote";
import { formatProductosEnManos, type PersonaEnManos } from "@/lib/dominio/lote-en-manos";
import { formatCentavos } from "@/lib/money";

type BotellasPedidoProps = {
  cobranza: CobranzaPedido;
  personasEnManos: PersonaEnManos[];
  totalEnManos: number;
};

function Fila({
  etiqueta,
  valor,
  sub,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-text">{etiqueta}</span>
        <span className="font-medium text-text tabular-nums">{valor}</span>
      </div>
      {sub}
    </div>
  );
}

/**
 * Bloque "Botellas" del detalle de un pedido (bloque 3): cuántas se produjeron, dónde
 * están (depósito / en manos de revendedoras) y cuánto tiene que entrar
 * todavía por lo vendido — todo SUMADO entre las presentaciones del
 * pedido (el desglose por presentación ya vive en "Costo por botella").
 */
export function BotellasPedido({ cobranza, personasEnManos, totalEnManos }: BotellasPedidoProps) {
  return (
    <div className="flex flex-col">
      <Separador titulo="Botellas" />

      <Fila etiqueta="Producidas" valor={cobranza.producidas} />
      <Fila etiqueta="En depósito" valor={cobranza.enDeposito} />
      <Fila
        etiqueta="En poder de revendedoras"
        valor={totalEnManos}
        sub={
          personasEnManos.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              {personasEnManos.map((persona) => (
                <div
                  key={persona.vendedorId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]"
                >
                  <Link
                    href={`/revendedores/${persona.vendedorId}`}
                    className="min-w-0 break-words text-primary underline decoration-mark underline-offset-4"
                  >
                    {persona.nombre}
                  </Link>
                  <span className="text-text-muted tabular-nums">
                    {formatProductosEnManos(persona.productos)}
                  </span>
                </div>
              ))}
            </div>
          )
        }
      />
      <Fila etiqueta="Vendidas" valor={cobranza.vendidas} />
      <Fila etiqueta="Pérdidas" valor={cobranza.perdidas} />

      {cobranza.esperadoTotalCentavos > 0 && (
        <Fila
          etiqueta="Tiene que entrar por lo vendido"
          valor={formatCentavos(cobranza.esperadoPorVendidasCentavos)}
          sub={
            <span className="text-[11px] text-text-muted tabular-nums">
              si se vende todo {formatCentavos(cobranza.esperadoTotalCentavos)}
            </span>
          }
        />
      )}
    </div>
  );
}
