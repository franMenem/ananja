import Link from "next/link";

import { UmbralEditable } from "@/components/stock/umbral-editable";
import { Fila } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import type { PresentacionBotellas } from "@/lib/dominio/botellas";
import type { SegmentoDeposito } from "@/lib/dominio/deposito-lotes";
import { envase, formatPresentacion } from "@/lib/negocio";

/** "12 en depósito · 3 en revendedoras" (+ "mínimo N" si quedan pocas). */
export function detallePresentacion(p: Pick<PresentacionBotellas, "deposito" | "revendedoras" | "quedanPocas" | "umbralMinimo">): string {
  const base = `${p.deposito} en depósito · ${p.revendedoras} en revendedoras`;
  return p.quedanPocas ? `${base} · mínimo ${p.umbralMinimo}` : base;
}

/**
 * Una presentación en "Por tamaño": tocarla despliega de qué pedido es lo
 * que queda en el depósito y el mínimo para avisar.
 */
export function PresentacionDeposito({
  presentacion,
  segmentos,
}: {
  presentacion: PresentacionBotellas;
  segmentos: SegmentoDeposito[];
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Fila
          className="min-w-0 flex-1"
          titulo={presentacion.nombre || formatPresentacion(presentacion.presentacionMl)}
          detalle={detallePresentacion(presentacion)}
          valor={
            presentacion.quedanPocas ? (
              <Pastilla variante="aviso">Quedan pocas</Pastilla>
            ) : undefined
          }
        />
        <span aria-hidden="true" className="shrink-0 text-[20px] text-text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-2 pb-3">
        {segmentos.length > 0 ? (
          <p className="text-[14px] text-text-muted tabular-nums">
            En el depósito:{" "}
            {segmentos
              .map((segmento, i) =>
                segmento.loteId ? (
                  <Link
                    prefetch={false}
                    key={i}
                    href={`/stock/lotes/${segmento.loteId}`}
                    className="text-text underline decoration-[#d0cec8] underline-offset-4"
                  >
                    {segmento.texto}
                  </Link>
                ) : (
                  <span key={i}>{segmento.texto}</span>
                ),
              )
              .reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, " · ", el]), [])}
          </p>
        ) : (
          <p className="text-[14px] text-text-muted">No hay {envase(2)} de este tamaño en el depósito.</p>
        )}
        <UmbralEditable productoId={presentacion.productoId} umbralMinimo={presentacion.umbralMinimo} />
      </div>
    </details>
  );
}
