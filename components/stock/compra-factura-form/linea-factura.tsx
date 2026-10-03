"use client";

import { MontoInput } from "@/components/monto-input";
import type { EstadoLineaFactura } from "@/lib/dominio/factura-insumos";
import { UNIDAD_INSUMO_LABELS, type Insumo } from "@/lib/dominio/insumos";

import { inputClass, labelClass, type LineaEditable } from "@/components/stock/compra-factura-form/tipos";

type LineaFacturaCamposProps = {
  linea: LineaEditable;
  indice: number;
  estado: EstadoLineaFactura;
  insumo: Insumo | undefined;
  insumos: Insumo[];
  insumosLoading: boolean;
  mostrarQuitar: boolean;
  onCambiar: (cambios: Partial<Omit<LineaEditable, "key">>) => void;
  onQuitar: () => void;
};

/** Una línea de "Cargar compra" (`CompraFacturaForm`): insumo, cantidad y
 * precio unitario, con los errores de `evaluarLineaFactura` (lib/dominio/
 * factura-insumos.ts) mostrados debajo de cada campo. */
export function LineaFacturaCampos({
  linea,
  indice,
  estado,
  insumo,
  insumos,
  insumosLoading,
  mostrarQuitar,
  onCambiar,
  onQuitar,
}: LineaFacturaCamposProps) {
  const unidad = insumo
    ? (UNIDAD_INSUMO_LABELS[insumo.unidad as keyof typeof UNIDAD_INSUMO_LABELS]?.toLowerCase() ??
      insumo.unidad)
    : null;

  return (
    <div
      role="group"
      aria-label={`Línea ${indice + 1}`}
      className="flex flex-col gap-3 border border-border bg-surface-raised p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] tracking-[0.14em] text-text-muted uppercase">
          Línea {indice + 1}
        </span>
        {mostrarQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            className="min-h-11 px-2 text-[11px] tracking-[0.12em] text-accent uppercase"
          >
            Quitar
          </button>
        )}
      </div>

      <div>
        <label htmlFor={`linea-${linea.key}-insumo`} className={labelClass}>
          Insumo
        </label>
        <select
          id={`linea-${linea.key}-insumo`}
          required
          disabled={insumosLoading}
          value={linea.insumoId}
          onChange={(event) => onCambiar({ insumoId: event.target.value })}
          className={`${inputClass} disabled:opacity-60`}
        >
          <option value="" disabled>
            {insumosLoading ? "Cargando…" : "Seleccioná un insumo"}
          </option>
          {insumos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        {/* Errores de la línea (evaluarLineaFactura) van por `error`: el
            campo muestra el suyo en `${id}-error` y no suma avisos propios.
            `exigirExacto`: "12,345" no se redondea en silencio al salir. */}
        <MontoInput
          id={`linea-${linea.key}-cantidad`}
          tipo="cantidad"
          label={`Cantidad${unidad ? ` (${unidad})` : ""}`}
          value={linea.cantidad}
          onChange={(valor) => onCambiar({ cantidad: valor })}
          required
          placeholder="0"
          exigirExacto
          error={estado.errorCantidad}
          labelClassName={labelClass}
          cajaClassName={`mt-1.5 flex border bg-surface px-3 focus-within:border-primary ${
            estado.errorCantidad ? "border-accent" : "border-border"
          }`}
          inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none"
        />
        <MontoInput
          id={`linea-${linea.key}-precio`}
          label="Precio unitario"
          value={linea.precio}
          onChange={(valor) => onCambiar({ precio: valor })}
          required
          placeholder="0,00"
          exigirExacto
          error={estado.errorPrecio}
          labelClassName={labelClass}
          cajaClassName={`mt-1.5 flex items-center gap-2 border bg-surface px-3 focus-within:border-primary ${
            estado.errorPrecio ? "border-accent" : "border-border"
          }`}
          inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none"
        />
      </div>
    </div>
  );
}
