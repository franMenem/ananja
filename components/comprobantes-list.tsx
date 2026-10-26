"use client";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { claseChip } from "@/components/ui/chip";
import { Fila, ListaTarjeta } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { useMemo, useState } from "react";
import Link from "next/link";

import { MiniaturaComprobante } from "@/components/comprobantes/miniatura-comprobante";
import { etiquetaMedioPago, type MedioPago } from "@/lib/etiquetas/medio-pago";
import { formatFechaCorta, hoyISO, rotuloGrupoFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

export type ComprobanteRow = {
  id: string;
  montoCentavos: number;
  debeCentavos: number;
  medioPago: MedioPago;
  fecha: string; // YYYY-MM-DD
  isPdf: boolean;
  tieneImagen: boolean;
  signedUrl: string | null;
  cantidadesLabel: string;
  vendedorNombre: string | null;
  /** A quién se le vendió (si se cargó un cliente). */
  clienteNombre?: string | null;
};

// Filtro por medio de pago (chips).
const FILTROS: { value: MedioPago | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "banco", label: "Banco" },
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "efectivo", label: "Efectivo" },
];

/** Estado de cobro de una venta: "Debe $X" (rojo) si queda algo por cobrar,
 * "Cobrado" (verde) si no. */
function EstadoCobro({ row }: { row: ComprobanteRow }) {
  return row.debeCentavos > 0 ? (
    <Pastilla variante="debe">Debe {formatCentavos(row.debeCentavos)}</Pastilla>
  ) : (
    <Pastilla variante="ok">Cobrado</Pastilla>
  );
}

function tituloDe(row: ComprobanteRow): string {
  return row.clienteNombre ?? row.vendedorNombre ?? "Venta";
}

function Miniatura({
  row,
  size,
}: {
  row: ComprobanteRow;
  size: "sm" | "md";
}) {
  return (
    <MiniaturaComprobante
      tieneImagen={row.tieneImagen}
      isPdf={row.isPdf}
      signedUrl={row.signedUrl}
      size={size}
    />
  );
}

export function ComprobantesList({ rows }: { rows: ComprobanteRow[] }) {
  const [filtro, setFiltro] = useState<MedioPago | "todos">("todos");
  const hoy = useMemo(() => hoyISO(), []);

  const filtered = useMemo(
    () => (filtro === "todos" ? rows : rows.filter((r) => r.medioPago === filtro)),
    [rows, filtro],
  );

  const grupos = useMemo(() => {
    const map = new Map<string, ComprobanteRow[]>();
    for (const row of filtered) {
      const key = rotuloGrupoFecha(row.fecha, hoy);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered, hoy]);

  if (rows.length === 0) {
    return (
      <Tarjeta className="flex flex-col items-center px-6 py-12 text-center">
        <p className="text-[20px] leading-[1.25] font-semibold text-text text-balance">
          Todavía no cargaste ninguna venta.
        </p>
        <p className="mt-2 max-w-md text-[16px] leading-[1.5] text-text-muted text-balance">
          Cuando registres la primera, acá vas a ver el monto, {NEGOCIO.envase.plural} y quién la
          cargó. Sacale una foto al comprobante y el monto se lee solo.
        </p>
        <Link prefetch={false} href="/comprobantes/nuevo" className={`${BOTON_PRIMARIO} mt-6 flex w-full max-w-xs px-6`}>
          + Cargar la primera
        </Link>
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros por medio de pago */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por medio de pago">
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

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-[16px] text-text-muted">No hay ventas con ese medio de pago.</p>
      ) : (
        <>
          {/* Lista agrupada — celular */}
          <div className="flex flex-col gap-4 md:hidden">
            {grupos.map(([grupo, items]) => (
              <section key={grupo} className="flex flex-col gap-1.5">
                <h2 className="px-1 text-[15px] font-semibold text-text-muted">{grupo}</h2>
                <ListaTarjeta className="px-4">
                  {items.map((row) => (
                    <Link prefetch={false} key={row.id} href={`/comprobantes/${row.id}`} className="flex items-center gap-3 py-2">
                      <Miniatura row={row} size="sm" />
                      <Fila
                        className="min-w-0 flex-1"
                        titulo={<span className="break-words">{tituloDe(row)}</span>}
                        detalle={
                          <div className="flex flex-col gap-1">
                            <span className="break-words">
                              {row.cantidadesLabel}
                              {row.vendedorNombre && row.clienteNombre ? ` · ${row.vendedorNombre}` : ""}
                              {" · "}
                              {row.fecha === hoy ? "hoy" : formatFechaCorta(row.fecha)}
                            </span>
                            {!row.tieneImagen && (
                              <span>
                                <Pastilla variante="aviso">Sin comprobante</Pastilla>
                              </span>
                            )}
                          </div>
                        }
                        valor={
                          <div className="flex flex-col items-end gap-1">
                            <span>{formatCentavos(row.montoCentavos)}</span>
                            <EstadoCobro row={row} />
                          </div>
                        }
                      />
                    </Link>
                  ))}
                </ListaTarjeta>
              </section>
            ))}

            <Link prefetch={false} href="/comprobantes/nuevo" className={`${BOTON_PRIMARIO} flex`}>
              + Cargar comprobante
            </Link>
          </div>

          {/* Tabla — escritorio */}
          <Tarjeta className="hidden md:block">
            <div className="overflow-x-auto">
              <div className="flex min-w-[760px] gap-3.5 border-b border-border pb-2.5 text-[14px] text-text-muted">
                <span className="w-14 shrink-0" />
                <span className="w-[82px] shrink-0">Fecha</span>
                <span className="min-w-0 flex-1">Venta</span>
                <span className="w-[110px] shrink-0">Medio</span>
                <span className="w-[120px] shrink-0 text-right">Monto</span>
                <span className="w-[150px] shrink-0">Estado</span>
              </div>
              <div className="flex min-w-[760px] flex-col divide-y divide-line">
                {filtered.map((row) => (
                  <Link
                    prefetch={false}
                    key={row.id}
                    href={`/comprobantes/${row.id}`}
                    className="flex min-h-14 items-center gap-3.5 py-2 hover:bg-background"
                  >
                    <span className="w-14 shrink-0">
                      <Miniatura row={row} size="md" />
                    </span>
                    <span className="w-[82px] shrink-0 text-[14px] text-text-muted tabular-nums">
                      {formatFechaCorta(row.fecha)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[16px] font-semibold text-text" title={tituloDe(row)}>
                        {tituloDe(row)}
                      </span>
                      <span className="truncate text-[14px] text-text-muted" title={row.cantidadesLabel}>
                        {row.cantidadesLabel}
                        {row.vendedorNombre && row.clienteNombre ? ` · ${row.vendedorNombre}` : ""}
                      </span>
                    </span>
                    <span className="w-[110px] shrink-0 text-[15px] text-text">{etiquetaMedioPago(row.medioPago)}</span>
                    <span className="w-[120px] shrink-0 text-right text-[16px] font-semibold whitespace-nowrap text-text tabular-nums">
                      {formatCentavos(row.montoCentavos)}
                    </span>
                    <span className="flex w-[150px] shrink-0 flex-col items-start gap-1">
                      <EstadoCobro row={row} />
                      {!row.tieneImagen && <Pastilla variante="aviso">Sin comprobante</Pastilla>}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
