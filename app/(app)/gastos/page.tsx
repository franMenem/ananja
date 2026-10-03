"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { listarCategorias, listarGastos, type CategoriaGasto, type GastoRow } from "@/lib/data/gastos";
import { etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";
import { NOMBRES_MES_MAYUS, formatFecha } from "@/lib/fechas";
import { agruparGastosPorMes, insumoDeMovimientos, rangoDeMes, resumenMesGastos, tituloGasto } from "@/lib/dominio/gastos";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

/** Título del gasto por lo que realmente fue (insumo comprado, concepto
 * pagado del pedido) + la categoría como texto secundario — ver
 * `tituloGasto` (lib/gastos.ts). */
function tituloDe(gasto: GastoRow) {
  return tituloGasto({
    categoriaNombre: gasto.categorias_gasto?.nombre,
    conceptoPago: gasto.concepto_pago,
    presentacionMl: gasto.productos?.presentacion_ml,
    insumoNombre: insumoDeMovimientos(gasto.movimientos_insumo),
  });
}

function todayYYYYMM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function GastosPage() {
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [mesFiltro, setMesFiltro] = useState("");

  // Independiente del filtro de gastos: se carga una sola vez al montar
  // (no hace falta repetirla cada vez que cambia categoría o mes).
  useEffect(() => {
    const supabase = createClient();
    listarCategorias(supabase).then(({ data }) => setCategorias(data));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const { data, error: fetchError } = await listarGastos(supabase, {
        categoriaId: categoriaFiltro || undefined,
        rango: mesFiltro ? rangoDeMes(mesFiltro) : undefined,
      });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError);
        setLoading(false);
        return;
      }

      setGastos(data);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [categoriaFiltro, mesFiltro]);

  const mesHeader = mesFiltro || todayYYYYMM();

  const { totalMesCentavos, categoriaMasPesada } = useMemo(() => {
    const delMes = gastos.filter((g) => g.fecha.startsWith(mesHeader));
    const { totalCentavos, categoriaMasPesada } = resumenMesGastos(delMes);
    return { totalMesCentavos: totalCentavos, categoriaMasPesada };
  }, [gastos, mesHeader]);

  const grupos = useMemo(() => agruparGastosPorMes(gastos), [gastos]);

  const hayFiltro = Boolean(categoriaFiltro || mesFiltro);

  return (
    <div className="flex flex-col pb-8">
      {/* Bloque oliva: sangra hasta los bordes del viewport, continuando la
          cabecera fija (design/handoff README § Chrome compartido / bloque oliva de total). */}
      <div className="-mx-5 -mt-4 flex flex-col gap-1 bg-primary px-5 pt-[14px] pb-5 lg:-mx-[var(--page-px)] lg:-mt-[34px] lg:flex-row lg:items-end lg:justify-between lg:px-[var(--page-px)] lg:pt-[26px] lg:pb-[22px]">
        <div>
          <span className="text-[10px] tracking-[0.22em] text-on-primary-muted uppercase">
            Gastado en {NOMBRES_MES_MAYUS[Number(mesHeader.slice(5, 7)) - 1].toLowerCase()}
          </span>
          <p className="font-display text-[32px] leading-[1] text-background tabular-nums md:text-[40px]">
            {formatCentavos(totalMesCentavos)}
          </p>
        </div>
        <div className="flex items-center gap-6">
          {categoriaMasPesada && (
            <div className="hidden md:block">
              <span className="text-[10px] tracking-[0.14em] text-on-primary-muted uppercase">
                Categoría más pesada
              </span>
              <p className="font-display text-lg text-background">
                {categoriaMasPesada}
              </p>
            </div>
          )}
          <span className="text-[11px] text-on-primary-muted md:self-end">
            {gastos.length} registro{gastos.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="hidden items-center justify-between gap-3 py-6 md:flex">
        <h1 className="font-display text-[38px] leading-[1.05] text-primary">
          Gastos
        </h1>
        <div className="flex items-center gap-4">
          {/* El <input type="month"> nativo se ve tosco vacío (appearance-none
              sin valor no muestra nada); se envuelve en un control propio
              que siempre exhibe "MM/AAAA ▾" y el input queda invisible
              encima, capturando el click para abrir el selector nativo. */}
          <div className="relative inline-flex min-h-[38px] cursor-pointer items-center gap-2 border border-border px-3">
            <span className="font-heading text-sm text-text tabular-nums">
              {mesHeader.slice(5, 7)}/{mesHeader.slice(0, 4)}
            </span>
            <span aria-hidden="true" className="text-[10px] text-text-muted">
              ▾
            </span>
            <input
              type="month"
              aria-label="Filtrar por mes"
              value={mesFiltro}
              onChange={(event) => setMesFiltro(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <Link
            href="/gastos/nuevo"
            className="flex min-h-[46px] items-center justify-center bg-primary px-5 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
          >
            + Registrar gasto
          </Link>
        </div>
      </div>

      {/* Chips de categoría */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 py-4 md:mx-0 md:flex-wrap md:px-0">
        <button
          type="button"
          onClick={() => setCategoriaFiltro("")}
          className={`min-h-[38px] shrink-0 whitespace-nowrap px-4 text-[12px] font-medium tracking-[0.06em] uppercase ${
            categoriaFiltro === ""
              ? "bg-primary text-background"
              : "border border-border text-text"
          }`}
        >
          Todas
        </button>
        {categorias.map((categoria) => (
          <button
            key={categoria.id}
            type="button"
            onClick={() => setCategoriaFiltro(categoria.id)}
            className={`min-h-[38px] shrink-0 whitespace-nowrap px-4 text-[12px] font-medium tracking-[0.06em] uppercase ${
              categoriaFiltro === categoria.id
                ? "bg-primary text-background"
                : "border border-border text-text"
            }`}
          >
            {categoria.nombre}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-accent">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-6 text-sm text-text-muted">Cargando…</p>
      ) : gastos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
          <span aria-hidden="true" className="h-0.5 w-10 bg-mark" />
          <p className="font-display text-[28px] leading-[1.2] text-primary">
            {hayFiltro
              ? "No hay gastos que coincidan con el filtro."
              : "Todavía no registraste ningún gasto."}
          </p>
          {!hayFiltro && (
            <p className="max-w-sm text-[13px] leading-[1.6] text-text-muted">
              Cuando registres el primero, acá vas a ver el monto, la
              categoría y quién lo cargó.
            </p>
          )}
          <Link
            href="/gastos/nuevo"
            className="mt-2 flex min-h-[52px] items-center justify-center bg-primary px-6 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
          >
            + Registrar {hayFiltro ? "un gasto" : "el primero"}
          </Link>
        </div>
      ) : (
        <>
          {/* Tabla — escritorio */}
          <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[590px] grid grid-cols-[82px_minmax(120px,1fr)_108px_100px_minmax(0,120px)_90px] gap-4 border-b border-border pb-2 text-[10px] tracking-[0.16em] text-text-muted uppercase">
              <span>Fecha</span>
              <span>Concepto</span>
              <span className="text-right">Monto</span>
              <span>Medio</span>
              <span>Vendedor</span>
              <span>Factura</span>
            </div>
            {gastos.map((gasto) => {
              const { titulo, categoria } = tituloDe(gasto);
              return (
              <Link
                key={gasto.id}
                href={`/gastos/${gasto.id}`}
                className="min-w-[590px] grid grid-cols-[82px_minmax(120px,1fr)_108px_100px_minmax(0,120px)_90px] items-center gap-4 border-b border-border py-[11px] text-sm hover:bg-border/30"
              >
                <span className="whitespace-nowrap text-text-muted">
                  {formatFecha(gasto.fecha)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-text">{titulo}</span>
                  {categoria && (
                    <span className="truncate text-[11px] text-text-muted">{categoria}</span>
                  )}
                </span>
                <span className="whitespace-nowrap text-right font-medium text-accent tabular-nums">
                  − {formatCentavos(gasto.monto_centavos).replace("$ ", "")}
                </span>
                <span className="whitespace-nowrap text-text-muted">
                  {etiquetaMedioPago(gasto.medio_pago)}
                </span>
                <span className="min-w-0 truncate text-text-muted">
                  {gasto.vendedores?.nombre ?? "—"}
                </span>
                <span className="whitespace-nowrap">
                  {!gasto.imagen_path && (
                    <span className="border border-accent px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-accent uppercase">
                      Sin factura
                    </span>
                  )}
                </span>
              </Link>
              );
            })}
          </div>
          </div>

          {/* Lista agrupada — celular */}
          <div className="flex flex-col md:hidden">
            {grupos.map(([mes, items]) => (
              <div key={mes} className="flex flex-col">
                <span className="pt-2 pb-1 text-[10px] tracking-[0.22em] text-text-muted uppercase">
                  {mes}
                </span>
                {items.map((gasto) => {
                  const { titulo, categoria } = tituloDe(gasto);
                  return (
                  <Link
                    key={gasto.id}
                    href={`/gastos/${gasto.id}`}
                    className="flex items-baseline gap-3 border-b border-border py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="w-[13px] shrink-0 text-accent"
                    >
                      −
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className="flex items-baseline gap-1.5">
                        <span className="block min-w-0 font-display text-[22px] leading-[1.1] break-words text-primary">
                          {titulo}
                        </span>
                        {!gasto.imagen_path && (
                          <span className="shrink-0 border border-accent px-1 text-[9px] tracking-[0.1em] text-accent uppercase">
                            Sin factura
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-text-muted">
                        {categoria ? `${categoria} · ` : ""}
                        {etiquetaMedioPago(gasto.medio_pago)} ·{" "}
                        {gasto.vendedores?.nombre ?? "—"} ·{" "}
                        {formatFecha(gasto.fecha)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[18px] font-medium text-accent tabular-nums">
                      {formatCentavos(gasto.monto_centavos)}
                    </span>
                  </Link>
                  );
                })}
              </div>
            ))}

            <Link
              href="/gastos/nuevo"
              className="mt-6 flex min-h-[52px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
            >
              + Registrar gasto
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
