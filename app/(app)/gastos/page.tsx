"use client";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { claseChip } from "@/components/ui/chip";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Fila, ListaTarjeta } from "@/components/ui/fila";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
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

  const nombreMesHeader = NOMBRES_MES_MAYUS[Number(mesHeader.slice(5, 7)) - 1].toLowerCase();

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-8">
      <EncabezadoPantalla
        titulo="Gastos"
        pregunta="¿En qué se fue la plata este mes?"
        acciones={
          <div className="hidden items-center gap-3 md:flex">
            {/* El <input type="month"> nativo se ve tosco vacío (appearance-none
                sin valor no muestra nada); se envuelve en un control propio
                que siempre exhibe "MM/AAAA ▾" y el input queda invisible
                encima, capturando el click para abrir el selector nativo. */}
            <div className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3">
              <span className="text-[16px] text-text tabular-nums">
                {mesHeader.slice(5, 7)}/{mesHeader.slice(0, 4)}
              </span>
              <span aria-hidden="true" className="text-[14px] text-text-muted">
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
            <Link prefetch={false} href="/gastos/nuevo" className={`${BOTON_PRIMARIO} flex px-5`}>
              + Registrar gasto
            </Link>
          </div>
        }
      />

      <Tarjeta className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-8">
        <NumeroGrande etiqueta={`Gastado en ${nombreMesHeader}`}>{formatCentavos(totalMesCentavos)}</NumeroGrande>
        <div className="flex min-w-0 flex-col gap-0.5">
          {categoriaMasPesada && (
            <>
              <span className="text-[15px] text-text-muted">Categoría más pesada</span>
              <span className="text-[18px] font-semibold break-words text-text">{categoriaMasPesada}</span>
            </>
          )}
          <span className="text-[14px] text-text-muted">
            {gastos.length} registro{gastos.length === 1 ? "" : "s"}
          </span>
        </div>
      </Tarjeta>

      {/* Chips de categoría */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        <button type="button" onClick={() => setCategoriaFiltro("")} aria-pressed={categoriaFiltro === ""} className={claseChip(categoriaFiltro === "")}>
          Todas
        </button>
        {categorias.map((categoria) => (
          <button
            key={categoria.id}
            type="button"
            onClick={() => setCategoriaFiltro(categoria.id)}
            aria-pressed={categoriaFiltro === categoria.id}
            className={claseChip(categoriaFiltro === categoria.id)}
          >
            {categoria.nombre}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-[16px] text-accent">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-6 text-[16px] text-text-muted">Cargando…</p>
      ) : gastos.length === 0 ? (
        <Tarjeta className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-[20px] leading-[1.25] font-semibold text-text text-balance">
            {hayFiltro ? "No hay gastos que coincidan con el filtro." : "Todavía no registraste ningún gasto."}
          </p>
          {!hayFiltro && (
            <p className="max-w-sm text-[16px] leading-[1.5] text-text-muted">
              Cuando registres el primero, acá vas a ver el monto, la categoría y quién lo cargó.
            </p>
          )}
          <Link prefetch={false} href="/gastos/nuevo" className={`${BOTON_PRIMARIO} mt-2 flex px-6`}>
            + Registrar {hayFiltro ? "un gasto" : "el primero"}
          </Link>
        </Tarjeta>
      ) : (
        <>
          {/* Tabla — escritorio */}
          <Tarjeta className="hidden md:block">
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-[82px_minmax(120px,1fr)_120px_100px_minmax(0,120px)_110px] gap-4 border-b border-border pb-2 text-[14px] text-text-muted">
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
                    prefetch={false}
                    key={gasto.id}
                    href={`/gastos/${gasto.id}`}
                    className="grid min-h-14 min-w-[640px] grid-cols-[82px_minmax(120px,1fr)_120px_100px_minmax(0,120px)_110px] items-center gap-4 border-b border-line py-2 text-[16px] hover:bg-background"
                  >
                    <span className="whitespace-nowrap text-text-muted">{formatFecha(gasto.fecha)}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-text" title={titulo}>
                        {titulo}
                      </span>
                      {categoria && (
                        <span className="truncate text-[14px] text-text-muted" title={categoria}>
                          {categoria}
                        </span>
                      )}
                    </span>
                    <span className="whitespace-nowrap text-right font-semibold text-text tabular-nums">
                      {formatCentavos(gasto.monto_centavos)}
                    </span>
                    <span className="whitespace-nowrap text-text-muted">{etiquetaMedioPago(gasto.medio_pago)}</span>
                    <span className="min-w-0 truncate text-text-muted" title={gasto.vendedores?.nombre ?? undefined}>
                      {gasto.vendedores?.nombre ?? "—"}
                    </span>
                    <span className="whitespace-nowrap">
                      {!gasto.imagen_path && <Pastilla variante="aviso">Sin factura</Pastilla>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Tarjeta>

          {/* Lista agrupada — celular */}
          <div className="flex flex-col gap-4 md:hidden">
            {grupos.map(([mes, items]) => (
              <section key={mes} className="flex flex-col gap-1.5">
                <h2 className="px-1 text-[15px] font-semibold text-text-muted">{mes}</h2>
                <ListaTarjeta className="px-4">
                  {items.map((gasto) => {
                    const { titulo, categoria } = tituloDe(gasto);
                    return (
                      <Link prefetch={false} key={gasto.id} href={`/gastos/${gasto.id}`} className="block">
                        <Fila
                          titulo={<span className="break-words">{titulo}</span>}
                          detalle={
                            <span className="break-words">
                              {categoria ? `${categoria} · ` : ""}
                              {formatFecha(gasto.fecha)}
                            </span>
                          }
                          valor={
                            <div className="flex flex-col items-end gap-1">
                              <span>{formatCentavos(gasto.monto_centavos)}</span>
                              {!gasto.imagen_path && <Pastilla variante="aviso">Sin factura</Pastilla>}
                            </div>
                          }
                        />
                      </Link>
                    );
                  })}
                </ListaTarjeta>
              </section>
            ))}

            <Link prefetch={false} href="/gastos/nuevo" className={`${BOTON_PRIMARIO} flex`}>
              + Registrar gasto
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
