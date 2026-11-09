"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campo";
import { claseChip } from "@/components/ui/chip";
import { Fila } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import {
  filtrarVentasMi,
  hayVentasSinMedio,
  mensajeSinVentas,
  resumenFiltroMi,
  resumenVentasMi,
  type MedioFiltroMi,
  type MesVentasMi,
  type PeriodoVentasMi,
} from "@/lib/dominio/filtro-ventas-mi";
import { formatFecha, labelDeMes } from "@/lib/fechas";
import { envase } from "@/lib/negocio";
import { formatCentavos } from "@/lib/money";

const PERIODOS: { value: PeriodoVentasMi; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "mes", label: "Este mes" },
  { value: "todo", label: "Todo" },
  { value: "dia", label: "Un día" },
];

const MEDIOS: { value: MedioFiltroMi; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "efectivo", label: MEDIO_PAGO_LABELS.efectivo },
  { value: "mercado_pago", label: MEDIO_PAGO_LABELS.mercado_pago },
  { value: "banco", label: MEDIO_PAGO_LABELS.banco },
];

/** Ventas por mes: el filtro se arma en una hoja y se aplica con "Aplicar" (en memoria, sin query params). */
export function VentasFiltradas({ meses, hoy }: { meses: MesVentasMi[]; hoy: string }) {
  const [abierta, setAbierta] = useState(false);
  // Filtro aplicado (el que mira la lista).
  const [periodo, setPeriodo] = useState<PeriodoVentasMi>("todo");
  const [medio, setMedio] = useState<MedioFiltroMi>("todos");
  const [dia, setDia] = useState<string | null>(null);
  // Borrador dentro de la hoja: no toca la lista hasta "Aplicar".
  const [bPeriodo, setBPeriodo] = useState<PeriodoVentasMi>("todo");
  const [bMedio, setBMedio] = useState<MedioFiltroMi>("todos");
  const [bDia, setBDia] = useState<string>(hoy);

  const opcionesMedio = useMemo(
    () => (hayVentasSinMedio(meses) ? [...MEDIOS, { value: "sin_cargar" as const, label: "Sin cargar" }] : MEDIOS),
    [meses],
  );
  const visibles = useMemo(() => filtrarVentasMi(meses, { periodo, medio, dia, hoy }), [meses, periodo, medio, dia, hoy]);
  const resumen = useMemo(() => resumenVentasMi(visibles), [visibles]);

  if (meses.length === 0) {
    return <p className="py-6 text-center text-[16px] text-text-muted">{mensajeSinVentas("todo", "todos")}</p>;
  }

  function abrirHoja() {
    setBPeriodo(periodo);
    setBMedio(medio);
    setBDia(dia ?? hoy);
    setAbierta(true);
  }

  function aplicar() {
    setPeriodo(bPeriodo);
    setMedio(bMedio);
    setDia(bPeriodo === "dia" ? bDia || hoy : null);
    setAbierta(false);
  }

  function limpiar() {
    setBPeriodo("todo");
    setBMedio("todos");
    setBDia(hoy);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[16px] text-text-muted">{resumenFiltroMi(periodo, medio, dia)}</p>
        <button type="button" onClick={abrirHoja} className={`${BOTON_SECUNDARIO} shrink-0 px-4`}>
          Filtrar
        </button>
      </div>

      <BottomSheet open={abierta} ariaLabel="Filtrar mis ventas">
        <h2 className="font-display text-[24px] text-text">Filtrar ventas</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-text">Período</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
              {PERIODOS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setBPeriodo(f.value)}
                  aria-pressed={bPeriodo === f.value}
                  className={claseChip(bPeriodo === f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {bPeriodo === "dia" && (
              <Entrada
                type="date"
                aria-label="Día"
                value={bDia}
                max={hoy}
                onChange={(e) => setBDia(e.target.value)}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-text">Medio de pago</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Medio de pago">
              {opcionesMedio.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setBMedio(f.value)}
                  aria-pressed={bMedio === f.value}
                  className={claseChip(bMedio === f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={aplicar} className={`${BOTON_PRIMARIO} flex-[1.6] px-4`}>
            Aplicar
          </button>
          <button type="button" onClick={limpiar} className={`${BOTON_SECUNDARIO} flex-1 px-4`}>
            Limpiar
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAbierta(false)}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-[15px] text-text-muted"
        >
          Cerrar sin aplicar
        </button>
      </BottomSheet>

      {resumen.botellas > 0 && (
        <Tarjeta className="flex flex-col gap-1">
          <p className="text-[18px] font-semibold text-text">
            {resumen.botellas} {envase(resumen.botellas)}
            {" · "}
            <span className="tabular-nums">{formatCentavos(resumen.totalCentavos)}</span>
          </p>
          <ul className="flex flex-col gap-0.5 text-[16px] text-text">
            {resumen.porProducto.map((p) => (
              <li key={p.productoNombre} className="break-words">
                {p.cantidad} × {p.productoNombre}
              </li>
            ))}
          </ul>
          {resumen.sinPrecio > 0 && (
            <p className="text-[14px] text-text-muted">{resumen.sinPrecio} sin precio cargado</p>
          )}
        </Tarjeta>
      )}

      {visibles.length === 0 ? (
        <p className="py-6 text-center text-[16px] text-text-muted">{mensajeSinVentas(periodo, medio, dia)}</p>
      ) : (
        visibles.map(({ periodo: mes, ventas }) => {
          const total = ventas.reduce((acc, v) => acc + (v.totalCentavos ?? 0), 0);
          return (
            <Tarjeta como="section" key={mes} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px] leading-tight font-bold text-text">{labelDeMes(mes)}</h2>
                <span className="shrink-0 text-[16px] font-semibold tabular-nums text-text">
                  {formatCentavos(total)}
                </span>
              </div>
              <div className="flex flex-col divide-y divide-line">
                {ventas.map((v) => (
                  <Link prefetch={false} key={v.id} href={`/mi/ventas/${v.id}`} className="block hover:bg-background">
                    <Fila
                      titulo={
                        <span className="break-words">
                          {v.cantidad} × {v.productoNombre}
                        </span>
                      }
                      detalle={`${formatFecha(v.fecha)}${v.medioPago ? ` · ${MEDIO_PAGO_LABELS[v.medioPago]}` : ""}`}
                      valor={
                        v.totalCentavos !== null ? (
                          formatCentavos(v.totalCentavos)
                        ) : (
                          <Pastilla variante="aviso">Cargar precio</Pastilla>
                        )
                      }
                    />
                  </Link>
                ))}
              </div>
            </Tarjeta>
          );
        })
      )}
    </>
  );
}
