"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { MiniaturaComprobante } from "@/components/comprobantes/miniatura-comprobante";
import {
  filtrarPagosPorEstado,
  textoEstadoPago,
  type FiltroEstadoPago,
  type PagoRevendedorFila,
} from "@/lib/dominio/pagos-revendedor";
import { etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";
import { formatDiaMesAbrev, hoyISO, rotuloGrupoFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

/** Fila + lo que arma el servidor con el path de la foto (URL firmada). */
export type PagoRevendedorItem = PagoRevendedorFila & {
  isPdf: boolean;
  signedUrl: string | null;
};

const FILTROS: { value: FiltroEstadoPago; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "confirmado", label: "Confirmados" },
  { value: "rechazado", label: "Rechazados" },
];

const MENSAJE_FILTRO_VACIO: Record<Exclude<FiltroEstadoPago, "todos">, string> = {
  pendiente: "No hay pagos pendientes de confirmar.",
  confirmado: "Todavía no hay pagos confirmados.",
  rechazado: "No hay pagos rechazados.",
};

export function PagosRevendedorList({ rows }: { rows: PagoRevendedorItem[] }) {
  const [filtro, setFiltro] = useState<FiltroEstadoPago>("todos");
  const hoy = useMemo(() => hoyISO(), []);

  const filtradas = useMemo(() => filtrarPagosPorEstado(rows, filtro), [rows, filtro]);

  const grupos = useMemo(() => {
    const map = new Map<string, PagoRevendedorItem[]>();
    for (const row of filtradas) {
      const key = rotuloGrupoFecha(row.fecha, hoy);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtradas, hoy]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center px-8 py-16 text-center">
        <span className="h-0.5 w-10 bg-mark" aria-hidden="true" />
        <p className="font-display mt-5 text-[28px] leading-[1.2] text-primary text-balance md:text-[30px]">
          Todavía no hay pagos de revendedores.
        </p>
        <p className="mt-3.5 max-w-md text-[13px] leading-[1.6] text-text-muted text-balance">
          Cuando una revendedora informe un pago desde su celular, lo vas a ver acá con su
          comprobante, a quién se lo pagó y si ya lo confirmaron.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3.5">
        {FILTROS.map((f) => {
          const active = filtro === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              aria-pressed={active}
              className={`flex min-h-[38px] shrink-0 items-center px-3.5 text-[11px] tracking-[0.1em] uppercase transition-colors ${
                active ? "bg-primary text-background" : "border border-border text-text-muted"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          {filtro === "todos" ? "No hay pagos." : MENSAJE_FILTRO_VACIO[filtro]}
        </p>
      ) : (
        <div className="flex flex-col">
          {grupos.map(([grupo, items]) => (
            <div key={grupo}>
              <div className="pt-3 pb-1">
                <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                  {grupo}
                </span>
              </div>
              {items.map((row) => (
                <FilaPago key={row.id} row={row} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilaPago({ row }: { row: PagoRevendedorItem }) {
  return (
    <Link
      href={`/tareas/pagos/${row.id}`}
      className="flex items-start gap-3 border-b border-border py-3 hover:bg-border/30 md:gap-4"
    >
      <MiniaturaComprobante
        tieneImagen={row.imagenPath !== null}
        isPdf={row.isPdf}
        signedUrl={row.signedUrl}
        size="sm"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-[26px] leading-none break-all text-primary tabular-nums">
          {formatCentavos(row.montoCentavos)}
        </span>
        <span className="text-[13px] break-words text-text">
          {row.quienPago} <span aria-hidden="true">→</span>
          <span className="sr-only"> a </span> {row.destino}
        </span>
        <span className="text-xs break-words text-text-muted">
          {etiquetaMedioPago(row.medioPago)} · {formatDiaMesAbrev(row.fecha)} ·{" "}
          <span className={row.estado === "confirmado" ? undefined : "font-medium text-accent"}>
            {textoEstadoPago(row)}
          </span>
        </span>
        {row.estado === "rechazado" && row.motivoRechazo && (
          <span className="text-xs break-words text-accent">Motivo: {row.motivoRechazo}</span>
        )}
        {row.nota && (
          <span className="line-clamp-2 text-xs break-words text-text-muted italic">
            “{row.nota}”
          </span>
        )}
      </div>
    </Link>
  );
}
