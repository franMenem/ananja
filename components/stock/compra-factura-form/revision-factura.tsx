"use client";

import {
  formatCostoUnitario,
  type FacturaInsumosCalculada,
} from "@/lib/dominio/factura-insumos";
import { formatNumeroInsumo, UNIDAD_INSUMO_LABELS } from "@/lib/dominio/insumos";
import { formatCentavos } from "@/lib/money";

function FilaTotal({
  label,
  nota,
  monto,
  destacado = false,
}: {
  label: string;
  nota?: string;
  monto: number;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-[13px]">
      <span className="min-w-0 break-words text-text">
        {label}
        {nota && <span className="text-[11px] text-text-muted"> · {nota}</span>}
      </span>
      <span
        className={`shrink-0 tabular-nums ${destacado ? "font-medium text-primary" : "text-text"}`}
      >
        {formatCentavos(monto)}
      </span>
    </div>
  );
}

/**
 * "Revisá la factura": por línea, importe, IVA, envío prorrateado por
 * unidades, total y costo por unidad; abajo, subtotal, IVA y total de la
 * factura (para comparar con la impresa), envío y total pagado.
 */
export function RevisionFactura({
  calculo,
  nombres,
  unidades,
  preciosSinIva,
  ivaPct,
}: {
  calculo: FacturaInsumosCalculada;
  /** Nombre y unidad de cada línea de `calculo.lineas`, mismo orden. */
  nombres: string[];
  unidades: string[];
  preciosSinIva: boolean;
  ivaPct: number;
}) {
  const ivaTexto = `IVA ${ivaPct.toLocaleString("es-AR")}%`;
  return (
    <div className="flex flex-col">
      {calculo.lineas.map((linea, i) => {
        const redondeado = formatCentavos(Math.round(linea.costoUnitarioCentavos));
        const exacto = formatCostoUnitario(linea.costoUnitarioCentavos);
        return (
          <div key={i} className="flex flex-col gap-1.5 border-b border-border py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-[14px] text-text">
                {nombres[i] ?? "Insumo"}
              </span>
              <span className="shrink-0 text-[14px] font-medium text-primary tabular-nums">
                {formatCentavos(linea.totalCentavos)}
              </span>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-[12px] text-text-muted tabular-nums">
              <dt className="min-w-0 break-words">
                {formatNumeroInsumo(linea.cantidad)} × {formatCentavos(linea.precioUnitarioCentavos)}
              </dt>
              <dd className="text-right">{formatCentavos(linea.importeCentavos)}</dd>
              {preciosSinIva && (
                <>
                  <dt>+ {ivaTexto}</dt>
                  <dd className="text-right">{formatCentavos(linea.ivaCentavos)}</dd>
                </>
              )}
              {calculo.envioCentavos > 0 && (
                <>
                  <dt>+ Envío (por unidades)</dt>
                  <dd className="text-right">{formatCentavos(linea.envioCentavos)}</dd>
                </>
              )}
              <dt className="text-text">
                Costo por{" "}
                {UNIDAD_INSUMO_LABELS[unidades[i] as keyof typeof UNIDAD_INSUMO_LABELS]?.toLowerCase() ??
                  unidades[i] ??
                  "unidad"}
              </dt>
              <dd className="text-right">
                <strong className="font-medium text-primary">{redondeado}</strong>
                {exacto !== redondeado && <span> ({exacto.replace("$ ", "")})</span>}
              </dd>
            </dl>
          </div>
        );
      })}

      <div className="flex flex-col pt-2">
        <FilaTotal label="Subtotal" monto={calculo.subtotalCentavos} />
        {preciosSinIva && <FilaTotal label={ivaTexto} monto={calculo.ivaCentavos} />}
        <FilaTotal
          label="Total factura"
          nota="compará con el total impreso"
          monto={calculo.totalFacturaCentavos}
          destacado
        />
        {calculo.envioCentavos > 0 && <FilaTotal label="Envío" monto={calculo.envioCentavos} />}
        <div className="flex items-baseline justify-between gap-3 pt-3">
          <span className="text-[11px] tracking-[0.14em] text-text-muted uppercase">
            Total pagado
          </span>
          <span className="font-display text-[26px] leading-none text-primary tabular-nums">
            {formatCentavos(calculo.totalPagadoCentavos)}
          </span>
        </div>
      </div>
    </div>
  );
}
