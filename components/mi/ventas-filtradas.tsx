"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { claseChip } from "@/components/ui/chip";
import { Fila } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import {
  filtrarVentasMi,
  hayVentasSinMedio,
  mensajeSinVentas,
  type MedioFiltroMi,
  type MesVentasMi,
  type PeriodoVentasMi,
} from "@/lib/dominio/filtro-ventas-mi";
import { formatFecha, labelDeMes } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

const PERIODOS: { value: PeriodoVentasMi; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "mes", label: "Este mes" },
  { value: "todo", label: "Todo" },
];

const MEDIOS: { value: MedioFiltroMi; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "efectivo", label: MEDIO_PAGO_LABELS.efectivo },
  { value: "mercado_pago", label: MEDIO_PAGO_LABELS.mercado_pago },
  { value: "banco", label: MEDIO_PAGO_LABELS.banco },
];

/** Ventas por mes con filtro de período y medio de pago (en memoria, sin query params). */
export function VentasFiltradas({ meses, hoy }: { meses: MesVentasMi[]; hoy: string }) {
  const [periodo, setPeriodo] = useState<PeriodoVentasMi>("todo");
  const [medio, setMedio] = useState<MedioFiltroMi>("todos");

  const opcionesMedio = useMemo(
    () => (hayVentasSinMedio(meses) ? [...MEDIOS, { value: "sin_cargar" as const, label: "Sin cargar" }] : MEDIOS),
    [meses],
  );
  const visibles = useMemo(() => filtrarVentasMi(meses, { periodo, medio, hoy }), [meses, periodo, medio, hoy]);

  if (meses.length === 0) {
    return <p className="py-6 text-center text-[16px] text-text-muted">{mensajeSinVentas("todo", "todos")}</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filtrar por período">
          {PERIODOS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setPeriodo(f.value)}
              aria-pressed={periodo === f.value}
              className={claseChip(periodo === f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filtrar por medio de pago">
          {opcionesMedio.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setMedio(f.value)}
              aria-pressed={medio === f.value}
              className={claseChip(medio === f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-6 text-center text-[16px] text-text-muted">{mensajeSinVentas(periodo, medio)}</p>
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
