"use client";

import { MontoInput } from "@/components/monto-input";
import { CLASE_CAJA_MONTO, CLASE_CAJA_MONTO_ERROR, Campo, Selector } from "@/components/ui/campo";
import type { EstadoLineaFactura } from "@/lib/dominio/factura-insumos";
import { UNIDAD_INSUMO_LABELS, type Insumo } from "@/lib/dominio/insumos";

import type { LineaEditable } from "@/components/stock/compra-factura-form/tipos";

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
      className="flex flex-col gap-4 rounded-xl border border-border bg-background p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-text">Línea {indice + 1}</h3>
        {mostrarQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar la línea ${indice + 1}`}
            className="min-h-11 px-2 text-[15px] font-semibold text-accent"
          >
            Quitar
          </button>
        )}
      </div>

      <Campo id={`linea-${linea.key}-insumo`} etiqueta="Insumo">
        <Selector
          required
          disabled={insumosLoading}
          value={linea.insumoId}
          onChange={(event) => onCambiar({ insumoId: event.target.value })}
          className="disabled:opacity-60"
        >
          <option value="" disabled>
            {insumosLoading ? "Cargando…" : "Seleccioná un insumo"}
          </option>
          {insumos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </Selector>
      </Campo>

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
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
          cajaClassName={estado.errorCantidad ? `${CLASE_CAJA_MONTO_ERROR}` : CLASE_CAJA_MONTO}
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
          cajaClassName={estado.errorPrecio ? `${CLASE_CAJA_MONTO_ERROR}` : CLASE_CAJA_MONTO}
        />
      </div>
    </div>
  );
}
