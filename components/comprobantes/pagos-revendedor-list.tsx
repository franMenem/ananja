"use client";

import { claseChip } from "@/components/ui/chip";
import { Fila, ListaTarjeta } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
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
      <Tarjeta className="flex flex-col items-center px-6 py-12 text-center">
        <p className="text-[20px] leading-[1.25] font-semibold text-text text-balance">
          Todavía no hay pagos informados.
        </p>
        <p className="mt-2 max-w-md text-[16px] leading-[1.5] text-text-muted text-balance">
          Cuando una revendedora informe un pago desde su celular, lo vas a ver acá con su
          comprobante, a quién se lo pagó y si ya lo confirmaron.
        </p>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltro(f.value)}
            aria-pressed={filtro === f.value}
            className={claseChip(filtro === f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-[16px] text-text-muted">
          {filtro === "todos" ? "No hay pagos." : MENSAJE_FILTRO_VACIO[filtro]}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map(([grupo, items]) => (
            <section key={grupo} className="flex flex-col gap-1.5">
              <h2 className="px-1 text-[15px] font-semibold text-text-muted">{grupo}</h2>
              <ListaTarjeta className="px-4">
                {items.map((row) => (
                  <FilaPago key={row.id} row={row} />
                ))}
              </ListaTarjeta>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilaPago({ row }: { row: PagoRevendedorItem }) {
  return (
    <Link href={`/tareas/pagos/${row.id}`} className="flex items-center gap-3 py-2 hover:bg-background">
      <span className="hidden min-[380px]:block">
        <MiniaturaComprobante
          tieneImagen={row.imagenPath !== null}
          isPdf={row.isPdf}
          signedUrl={row.signedUrl}
          size="sm"
        />
      </span>
      <Fila
        className="min-w-0 flex-1"
        titulo={
          <span className="break-words">
            {row.quienPago} <span aria-hidden="true">→</span>
            <span className="sr-only"> a </span> {row.destino}
          </span>
        }
        detalle={
          <div className="flex flex-col gap-1">
            <span className="break-words">
              {etiquetaMedioPago(row.medioPago)} · {formatDiaMesAbrev(row.fecha)}
            </span>
            {row.estado === "rechazado" && row.motivoRechazo && (
              <span className="break-words">Motivo: {row.motivoRechazo}</span>
            )}
            {row.nota && <span className="line-clamp-2 break-words italic">“{row.nota}”</span>}
          </div>
        }
        valor={
          <div className="flex flex-col items-end gap-1">
            <span>{formatCentavos(row.montoCentavos)}</span>
            <Pastilla
              variante={row.estado === "confirmado" ? "ok" : row.estado === "pendiente" ? "confirmar" : "debe"}
            >
              {textoEstadoPago(row)}
            </Pastilla>
          </div>
        }
      />
    </Link>
  );
}
