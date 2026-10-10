import Link from "next/link";

import { LoteLink } from "@/components/revendedores/ficha/lote-link";
import {
  ENTREGAS_COORDINADORA_VISIBLES,
  type EntregasCoordinadora as Entregas,
  type FilaEntregaCoordinadora,
} from "@/lib/dominio/entregas-coordinador";
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
    <section className="flex flex-col gap-3">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">Entregas a sus revendedoras</span>
      <Cuerpo entregas={entregas} />
    </section>
  );
}

function Cuerpo({ entregas }: EntregasCoordinadoraProps) {
  if (entregas === null) {
    return <p className="py-2 text-sm text-text-muted">No se pudieron cargar las entregas.</p>;
  }
  if (entregas.filas.length === 0) {
    return <p className="py-2 text-sm text-text-muted">Todavía no hay entregas a sus revendedoras.</p>;
  }

  const recientes = entregas.filas.slice(0, ENTREGAS_COORDINADORA_VISIBLES);
  const anteriores = entregas.filas.slice(ENTREGAS_COORDINADORA_VISIBLES);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm text-text">
          Entregadas en total:{" "}
          <span className="font-medium tabular-nums">
            {entregas.totalBotellas} {envase(entregas.totalBotellas)}
          </span>
        </p>
        {entregas.totalPorProducto.length > 1 && (
          <p className="text-[12px] text-text-muted">
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
          <summary className="flex items-center gap-1.5 select-none text-[10px] tracking-[0.22em] text-text-muted uppercase [&::-webkit-details-marker]:hidden">
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
      href={`/revendedores/${fila.revendedoraId}`}
      className="font-medium text-text underline decoration-border underline-offset-4 hover:text-primary"
    >
      {fila.revendedoraNombre}
    </Link>
  );

  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-[12px] tabular-nums text-text-muted">{formatFecha(fila.fecha)}</span>
        <span className="min-w-0 break-words text-text">
          {fila.tipo === "devolucion" ? <>Devolvió {link}</> : <>A {link}</>}
        </span>
      </div>
      {fila.items.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[13px] text-text">
          {fila.items.map((it, i) => (
            <li key={i} className="min-w-0 break-words">
              <span className="tabular-nums">{it.cantidad}</span> × {it.productoNombre}
              <span className="text-text-muted"> · </span>
              <LoteLink loteId={it.loteId} fecha={it.loteFecha} />
            </li>
          ))}
        </ul>
      )}
      {fila.cargadaPor !== null && <p className="text-[11px] text-text-muted">la cargó {fila.cargadaPor}</p>}
    </div>
  );
}
