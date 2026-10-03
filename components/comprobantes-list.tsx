"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { MiniaturaComprobante } from "@/components/comprobantes/miniatura-comprobante";
import { etiquetaMedioPago, type MedioPago } from "@/lib/etiquetas/medio-pago";
import { formatFechaCorta, hoyISO, rotuloGrupoFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, capitalizar } from "@/lib/negocio";

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
};

// Abreviados para las chips de filtro (distinto de la etiqueta completa de
// `etiquetaMedioPago` que se usa en cada fila de la lista).
const FILTROS: { value: MedioPago | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "banco", label: "Banco" },
  { value: "mercado_pago", label: "M. Pago" },
  { value: "efectivo", label: "Efec." },
];

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
      <div className="flex flex-col items-center px-8 py-16 text-center">
        <span className="h-0.5 w-10 bg-mark" aria-hidden="true" />
        <p className="font-display mt-5 text-[28px] leading-[1.2] text-primary text-balance md:text-[30px]">
          Todavía no cargaste ningún comprobante.
        </p>
        <p className="mt-3.5 max-w-md text-[13px] leading-[1.6] text-text-muted text-balance">
          Cuando registres el primero, acá vas a ver el monto, {NEGOCIO.envase.plural} y
          quién lo cargó. Sacale una foto al comprobante y el monto se lee
          solo.
        </p>
        <Link
          href="/comprobantes/nuevo"
          className="mt-6 flex min-h-[52px] w-full max-w-xs items-center justify-center bg-primary px-6 text-[12px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Cargar el primero
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros por medio de pago */}
      <div className="flex gap-2 overflow-x-auto border-b border-border pb-3.5">
        {FILTROS.map((f) => {
          const active = filtro === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              aria-pressed={active}
              className={`flex min-h-[38px] shrink-0 items-center px-3.5 text-[11px] tracking-[0.1em] uppercase transition-colors ${
                active
                  ? "bg-primary text-background"
                  : "border border-border text-text-muted"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No hay comprobantes con ese medio de pago.
        </p>
      ) : (
        <>
          {/* Lista agrupada — celular */}
          <div className="flex flex-col md:hidden">
            {grupos.map(([grupo, items]) => (
              <div key={grupo}>
                <div className="pt-3 pb-1">
                  <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                    {grupo}
                  </span>
                </div>
                {items.map((row) => (
                  <Link
                    key={row.id}
                    href={`/comprobantes/${row.id}`}
                    className="flex items-center gap-3 border-b border-border py-3"
                  >
                    <Miniatura row={row} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[26px] leading-none text-primary tabular-nums">
                          {formatCentavos(row.montoCentavos)}
                        </span>
                        {row.debeCentavos > 0 && (
                          <span className="border border-accent px-1 text-[9px] tracking-[0.1em] text-accent uppercase">
                            Debe {formatCentavos(row.debeCentavos)}
                          </span>
                        )}
                        {!row.tieneImagen && (
                          <span className="border border-accent px-1 text-[9px] tracking-[0.1em] text-accent uppercase">
                            Sin comprobante
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-text-muted">
                        {row.cantidadesLabel}
                        {row.vendedorNombre ? ` · ${row.vendedorNombre}` : ""}
                        {row.fecha !== hoy ? ` · ${formatFechaCorta(row.fecha)}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 self-end pb-0.5 text-[10px] tracking-[0.14em] text-primary uppercase">
                      <span className="border-b border-mark pb-0.5">
                        {etiquetaMedioPago(row.medioPago)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}

            <div className="pt-5">
              <Link
                href="/comprobantes/nuevo"
                className="flex min-h-[52px] items-center justify-center bg-primary text-[12px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
              >
                + Cargar comprobante
              </Link>
            </div>
          </div>

          {/* Tabla — escritorio */}
          <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="flex min-w-[700px] gap-3.5 border-b border-border pb-2.5 text-[10px] tracking-[0.16em] text-text-muted uppercase">
              <span className="w-14 shrink-0" />
              <span className="w-[82px] shrink-0">Fecha</span>
              <span className="w-[150px] shrink-0 text-right">Monto</span>
              <span className="w-[140px] shrink-0">Medio</span>
              <span className="flex-1">{capitalizar(NEGOCIO.envase.plural)}</span>
              <span className="w-[100px] shrink-0">Vendedor</span>
            </div>
            <div className="flex min-w-[700px] flex-col">
              {filtered.map((row) => (
                <Link
                  key={row.id}
                  href={`/comprobantes/${row.id}`}
                  className="flex items-center gap-3.5 border-b border-border py-2.5 hover:bg-border/30"
                >
                  <span className="w-14 shrink-0">
                    <Miniatura row={row} size="md" />
                  </span>
                  <span className="w-[82px] shrink-0 text-xs text-text-muted tabular-nums">
                    {formatFechaCorta(row.fecha)}
                  </span>
                  <span className="font-display w-[150px] shrink-0 text-right text-[27px] leading-none text-primary tabular-nums">
                    {formatCentavos(row.montoCentavos)}
                  </span>
                  <span className="w-[140px] shrink-0 text-[10px] tracking-[0.16em] text-primary uppercase">
                    <span className="border-b border-mark pb-0.5">
                      {etiquetaMedioPago(row.medioPago)}
                    </span>
                  </span>
                  <span className="flex-1 text-[13px] text-text-muted">
                    {row.debeCentavos > 0 && (
                      <span className="mr-2 border border-accent px-1.5 py-0.5 text-[9px] whitespace-nowrap tracking-[0.12em] text-accent uppercase">
                        Debe {formatCentavos(row.debeCentavos)}
                      </span>
                    )}
                    {!row.tieneImagen && (
                      <span className="mr-2 border border-accent px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-accent uppercase">
                        Sin comprobante
                      </span>
                    )}
                    {row.cantidadesLabel}
                  </span>
                  <span className="w-[100px] shrink-0 text-[13px] text-text">
                    {row.vendedorNombre ?? "—"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
