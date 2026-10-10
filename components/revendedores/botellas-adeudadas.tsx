import Link from "next/link";
import type { ReactNode } from "react";

import { LoteLink } from "@/components/revendedores/ficha/lote-link";
import type {
  CantidadProducto,
  Estados,
  GrupoBotellas,
  GrupoPorLote,
  GrupoPorPersona,
  LineaCoordinadora,
  ResumenBotellas,
} from "@/lib/dominio/botellas-adeudadas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, concordar, envase } from "@/lib/negocio";

/** "8 × Botella 250 ml · 4 × Botella 500 ml" */
export function textoProductos(productos: CantidadProducto[]): string {
  return productos.map((p) => `${p.cantidad} × ${p.nombre}`).join(" · ");
}

const cantidadTexto = (n: number) => `${n} ${envase(n)}`;

/** "3 en poder · 2 vendidas sin pagar · 1 cobrada sin pasar" — solo lo que es > 0. */
export function textoEstados(e: Estados): string {
  const partes: string[] = [];
  if (e.enPoder > 0) partes.push(`${e.enPoder} en poder`);
  if (e.sinPagar > 0) {
    partes.push(`${e.sinPagar} ${e.sinPagar === 1 ? concordar("vendido", "vendida") : concordar("vendidos", "vendidas")} sin pagar`);
  }
  if (e.sinPasar > 0) {
    partes.push(`${e.sinPasar} ${e.sinPasar === 1 ? concordar("cobrado", "cobrada") : concordar("cobrados", "cobradas")} sin pasar`);
  }
  return partes.join(" · ");
}

const ROTULO = "text-[10px] tracking-[0.22em] text-text-muted uppercase";

function textoSinBotella(centavos: number): string {
  return `${centavos < 0 ? "−" : "+"} ${formatCentavos(Math.abs(centavos))} sin ${envase(1)} ${concordar("asignado", "asignada")}`;
}

function LineaEstado({
  titulo,
  cantidad,
  productos,
  sinBotellaCentavos = 0,
}: {
  titulo: string;
  cantidad: number;
  productos: CantidadProducto[];
  sinBotellaCentavos?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words text-text">{titulo}</span>
        {productos.length > 0 && <span className="break-words text-[12px] text-text-muted">{textoProductos(productos)}</span>}
        {sinBotellaCentavos !== 0 && (
          <span className="break-words text-[12px] text-text-muted">{textoSinBotella(sinBotellaCentavos)}</span>
        )}
      </div>
      {cantidad > 0 && <span className="shrink-0 tabular-nums text-text">{cantidadTexto(cantidad)}</span>}
    </div>
  );
}

function FilaDesglose({ encabezado, grupo }: { encabezado: ReactNode; grupo: GrupoBotellas }) {
  const estados = textoEstados(grupo.estados);
  return (
    <li className="flex flex-col gap-0.5 border-b border-border py-2 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words">{encabezado}</span>
        <span className="shrink-0 tabular-nums text-text">{cantidadTexto(grupo.total)}</span>
      </div>
      <span className="break-words text-[12px] text-text-muted">{textoProductos(grupo.productos)}</span>
      {estados && <span className="break-words text-[11px] text-text-muted">{estados}</span>}
    </li>
  );
}

function ListaPorLote({ lotes }: { lotes: GrupoPorLote[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={ROTULO}>Por lote</span>
      <ul className="flex flex-col">
        {lotes.map((l) => (
          <FilaDesglose
            key={l.loteId ?? "sin-lote"}
            encabezado={
              l.loteId === null ? <span className="text-text-muted">Sin lote asignado</span> : <LoteLink loteId={l.loteId} fecha={l.fecha} />
            }
            grupo={l}
          />
        ))}
      </ul>
    </div>
  );
}

function ListaPorPersona({ personas }: { personas: GrupoPorPersona[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={ROTULO}>Por persona</span>
      <ul className="flex flex-col">
        {personas.map((p) => (
          <FilaDesglose
            key={p.personaId}
            encabezado={
              <Link
                // `?rol=coordinador`: pista para que la ficha pida solo su tanda (ver `/revendedores/[id]`).
                href={p.esCoordinadora ? `/revendedores/${p.personaId}?rol=coordinador` : `/revendedores/${p.personaId}`}
                className="text-text underline decoration-border underline-offset-4 hover:text-primary"
              >
                {p.nombre}
              </Link>
            }
            grupo={p}
          />
        ))}
      </ul>
    </div>
  );
}

function Desglose({
  resumen,
  mostrarPorPersona,
  titulo,
}: {
  resumen: ResumenBotellas;
  mostrarPorPersona: boolean;
  titulo: string;
}) {
  return (
    <details className="group flex flex-col gap-3">
      <summary
        className={`flex min-h-11 cursor-pointer items-center gap-1.5 select-none ${ROTULO} [&::-webkit-details-marker]:hidden`}
      >
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        {titulo}
      </summary>
      <div className="flex flex-col gap-6 pb-1">
        <ListaPorLote lotes={resumen.porLote} />
        {mostrarPorPersona && <ListaPorPersona personas={resumen.porPersona} />}
      </div>
    </details>
  );
}

function tituloCoordinadora(c: LineaCoordinadora, unica: boolean): string {
  return unica
    ? `${concordar("Cobrados", "Cobradas")} por la coordinadora, sin pasar a ${NEGOCIO.nombre}`
    : `${concordar("Cobrados", "Cobradas")} por ${c.nombre}, sin pasar a ${NEGOCIO.nombre}`;
}

export type BotellasAdeudadasProps = {
  /** `null`: la lectura falló → "No se pudo calcular." sin romper la pantalla. */
  resumen: ResumenBotellas | null;
  /**
   * - `equipo`: bloque grande "Se le deben a Ananja" (listado y ficha de coordinadora).
   * - `revendedora`: una línea "Le debe a Ananja N botellas" para la ficha de una revendedora.
   */
  variante: "equipo" | "revendedora";
  /** Lista "Por persona" dentro del desglose (solo el listado general). */
  mostrarPorPersona?: boolean;
  /** Aclaración debajo de la cifra (ej. "Entre sus revendedoras y la plata que cobró."). */
  nota?: string;
};

/**
 * "Se le deben a Ananja N botellas": todas las botellas que salieron del
 * depósito y todavía no llegaron a Ananja en plata — en poder de
 * revendedoras, vendidas sin pagar y cobradas por la coordinadora sin pasar
 * (ver `lib/dominio/botellas-adeudadas.ts`). Solo presentación; la usan el
 * listado `/revendedores`, la ficha de la coordinadora y la de la revendedora.
 */
export function BotellasAdeudadas({ resumen, variante, mostrarPorPersona = false, nota }: BotellasAdeudadasProps) {
  const titulo = variante === "revendedora" ? `En ${envase(2)}` : `Se le deben a ${NEGOCIO.nombre}`;

  if (variante === "revendedora") {
    return (
      <section className="flex flex-col gap-1.5">
        <span className={ROTULO}>{titulo}</span>
        {resumen === null ? (
          <p className="text-[13px] text-text-muted">No se pudo calcular.</p>
        ) : resumen.total === 0 ? (
          <p className="text-[13px] text-text-muted">No le debe ninguna {envase(1)}.</p>
        ) : (
          <>
            <p className="text-[15px] text-text">
              Le debe a {NEGOCIO.nombre}{" "}
              <span className="font-display text-[26px] leading-[1.05] tabular-nums text-primary">
                {cantidadTexto(resumen.total)}
              </span>
            </p>
            <p className="text-[12px] text-text-muted">{textoProductos(resumen.productos)}</p>
            <p className="text-[12px] text-text-muted">{textoEstados(resumen.estados)}</p>
            <Desglose resumen={resumen} mostrarPorPersona={false} titulo="Ver por lote" />
          </>
        )}
      </section>
    );
  }

  const sinBotellaTotal = resumen?.coordinadoras.some((c) => c.sinBotellaCentavos !== 0) ?? false;
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-6">
      <span className={ROTULO}>{titulo}</span>
      {resumen === null ? (
        <p className="text-sm text-text-muted">No se pudo calcular.</p>
      ) : (
        <>
          {resumen.total > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="font-display text-[40px] leading-[1.05] tabular-nums text-primary">
                {cantidadTexto(resumen.total)}
              </p>
              <p className="text-[13px] text-text">{textoProductos(resumen.productos)}</p>
              {nota && <p className="text-[12px] text-text-muted">{nota}</p>}
            </div>
          ) : (
            <p className="text-[13px] text-text-muted">No se le debe ninguna {envase(1)}.</p>
          )}

          {(resumen.total > 0 || sinBotellaTotal) && (
            <div className="flex flex-col">
              {resumen.estados.enPoder > 0 && (
                <LineaEstado
                  titulo="En poder de revendedoras"
                  cantidad={resumen.estados.enPoder}
                  productos={resumen.productosPorEstado.enPoder}
                />
              )}
              {resumen.estados.sinPagar > 0 && (
                <LineaEstado
                  titulo={`${concordar("Vendidos", "Vendidas")} sin pagar`}
                  cantidad={resumen.estados.sinPagar}
                  productos={resumen.productosPorEstado.sinPagar}
                />
              )}
              {resumen.coordinadoras.map((c) => (
                <LineaEstado
                  key={c.personaId}
                  titulo={tituloCoordinadora(c, resumen.coordinadoras.length === 1)}
                  cantidad={c.total}
                  productos={c.productos}
                  sinBotellaCentavos={c.sinBotellaCentavos}
                />
              ))}
            </div>
          )}

          {resumen.total > 0 && (
            <Desglose resumen={resumen} mostrarPorPersona={mostrarPorPersona} titulo="Ver desglose" />
          )}
        </>
      )}
    </section>
  );
}
