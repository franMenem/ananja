"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  parsearFiltroMi,
  serializarFiltroMi,
  mensajeSinVentas,
  resumenFiltroMi,
  resumenVentasMi,
  type FiltroAplicadoMi,
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

/**
 * Ventas por mes: el filtro se arma en una hoja (borrador en memoria) y se
 * aplica con "Aplicar". El filtro APLICADO vive en la URL (`?p=&m=&d=`): así
 * sobrevive a abrir una venta y volver con "atrás". Se escribe con
 * `window.history.replaceState`, que Next integra con `useSearchParams` sin
 * pedirle la página al servidor: el filtrado es en el cliente sobre datos que
 * ya están cargados (con `router.replace` cada "Aplicar" re-pediría una
 * página `force-dynamic`).
 */
export function VentasFiltradas({ meses, hoy }: { meses: MesVentasMi[]; hoy: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [abierta, setAbierta] = useState(false);
  // Filtro aplicado (el que mira la lista): sale de la URL.
  const query = searchParams?.toString() ?? "";
  const aplicado = useMemo(() => parsearFiltroMi(new URLSearchParams(query)), [query]);
  const { periodo, medio } = aplicado;
  const dia = aplicado.periodo === "dia" ? aplicado.dia : null;
  // Borrador dentro de la hoja: no toca la lista hasta "Aplicar".
  const [bPeriodo, setBPeriodo] = useState<PeriodoVentasMi>("todo");
  const [bMedio, setBMedio] = useState<MedioFiltroMi>("todos");
  const [bDia, setBDia] = useState<string>(hoy);

  const opcionesMedio = useMemo(
    () => (hayVentasSinMedio(meses) ? [...MEDIOS, { value: "sin_cargar" as const, label: "Sin cargar" }] : MEDIOS),
    [meses],
  );
  const visibles = useMemo(() => filtrarVentasMi(meses, { ...aplicado, hoy }), [meses, aplicado, hoy]);
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
    const nuevo: FiltroAplicadoMi =
      bPeriodo === "dia"
        ? { periodo: "dia", medio: bMedio, dia: bDia || hoy }
        : { periodo: bPeriodo, medio: bMedio };
    const qs = serializarFiltroMi(nuevo);
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
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

      <BottomSheet open={abierta} ariaLabel="Filtrar mis ventas" onClose={() => setAbierta(false)}>
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
