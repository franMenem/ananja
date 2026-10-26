import Link from "next/link";

import { Tarjeta } from "@/components/ui/tarjeta";
import { LoteLink } from "@/components/revendedores/ficha/lote-link";
import {
  ENTREGAS_COORDINADORA_VISIBLES,
  type EntregasCoordinadora as Entregas,
  type FilaEntregaCoordinadora,
} from "@/lib/dominio/entregas-coordinador";
import { etiquetaEntregaAutomatica } from "@/lib/dominio/venta-directa";
import { formatFecha } from "@/lib/fechas";
import { envase } from "@/lib/negocio";

export type EntregasCoordinadoraProps = {
  /** `null` si la lectura falló (se avisa, no se dice "no hay entregas"). */
  entregas: Entregas | null;
};

/**
 * "Entregas a sus revendedoras" en la ficha admin de una coordinadora: a
 * quién le entregó, cuántas botellas y de qué lote. Solo presentación; el
 * armado y el orden están en `lib/dominio/entregas-coordinador.ts`. Las
 * `ENTREGAS_COORDINADORA_VISIBLES` más recientes se ven de entrada, el resto
 * va en un `<details>` (mismo plegado que `PlegadosFicha`).
 */
export function EntregasCoordinadora({ entregas }: EntregasCoordinadoraProps) {
  return (
    <Tarjeta como="section" aria-labelledby="coord-paso" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="coord-paso" className="text-[20px] leading-tight font-semibold text-text">
          Lo que pasó
        </h2>
        <p className="text-[14px] text-text-muted">Entregas y devoluciones a sus revendedoras.</p>
      </div>
      <Cuerpo entregas={entregas} />
    </Tarjeta>
  );
}

function Cuerpo({ entregas }: EntregasCoordinadoraProps) {
  if (entregas === null) {
    return <p className="py-2 text-[16px] text-text-muted">No se pudieron cargar las entregas.</p>;
  }
  if (entregas.filas.length === 0) {
    return <p className="py-2 text-[16px] text-text-muted">Todavía no hay entregas a sus revendedoras.</p>;
  }

  const recientes = entregas.filas.slice(0, ENTREGAS_COORDINADORA_VISIBLES);
  const anteriores = entregas.filas.slice(ENTREGAS_COORDINADORA_VISIBLES);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-[16px] text-text">
          Entregadas en total:{" "}
          <span className="font-medium tabular-nums">
            {entregas.totalBotellas} {envase(entregas.totalBotellas)}
          </span>
        </p>
        {entregas.hayAutomaticas && (
          <p className="text-[14px] text-text-muted">
            No cuenta lo que las revendedoras agarraron solas del depósito (entregas automáticas).
          </p>
        )}
        {entregas.totalPorProducto.length > 1 && (
          <p className="text-[14px] text-text-muted">
            {entregas.totalPorProducto.map((t) => `${t.cantidad} × ${t.productoNombre}`).join(" · ")}
          </p>
        )}
      </div>

      <div className="flex flex-col">
        {recientes.map((f) => (
          <FilaEntrega key={f.id} fila={f} />
        ))}
      </div>

      {anteriores.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-[15px] font-semibold text-primary select-none [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            Ver las anteriores ({anteriores.length})
          </summary>
          <div className="mt-2 flex flex-col">
            {anteriores.map((f) => (
              <FilaEntrega key={f.id} fila={f} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FilaEntrega({ fila }: { fila: FilaEntregaCoordinadora }) {
  const link = (
    <Link
      prefetch={false}
      href={`/revendedores/${fila.revendedoraId}`}
      className="inline-flex min-h-11 items-center font-semibold text-text underline decoration-border underline-offset-4 hover:text-primary"
    >
      {fila.revendedoraNombre}
    </Link>
  );

  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 text-[16px] last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-[14px] tabular-nums text-text-muted">{formatFecha(fila.fecha)}</span>
        <span className="min-w-0 break-words text-text">
          {fila.tipo === "devolucion" ? <>Devolvió {link}</> : <>A {link}</>}
        </span>
      </div>
      {fila.items.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[16px] text-text">
          {fila.items.map((it, i) => (
            <li key={i} className="min-w-0 break-words">
              <span className="tabular-nums">{it.cantidad}</span> × {it.productoNombre}
              <span className="text-text-muted"> · </span>
              <LoteLink loteId={it.loteId} fecha={it.loteFecha} />
            </li>
          ))}
        </ul>
      )}
      {fila.automatica && (
        <p className="text-[14px] text-text-muted">{etiquetaEntregaAutomatica(fila.tipo, true)}</p>
      )}
      {fila.cargadaPor !== null && <p className="text-[14px] text-text-muted">la cargó {fila.cargadaPor}</p>}
    </div>
  );
}
