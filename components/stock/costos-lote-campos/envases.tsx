"use client";

import { cuentaEnvaseCampo, type PedidoCalculado } from "@/lib/dominio/costos-lote";
import { formatPresentacion } from "@/lib/negocio";
import type { CostosLoteState } from "@/lib/dominio/lotes";

import { useProveedor } from "@/components/stock/proveedor-context";
import { MoneyField } from "@/components/stock/costos-lote-campos/campos";
import { parseCampo, type ProductoLoteItem } from "@/components/stock/costos-lote-campos/tipos";

type EnvasesBlockProps = {
  /** Solo las presentaciones que se están produciendo/editando ahora
   * (cantidad > 0) — un envase se pide por cada una de estas. */
  items: ProductoLoteItem[];
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
  /** `parsePctInput(value.ivaPct) ?? 0` — calculado una sola vez en
   * `CostosLoteCampos` (lo comparte con el bloque de Etiquetas). */
  ivaPctNum: number;
  /** Mismo cálculo de `calcularPedido` que usa la vista previa de "Costo
   * por botella" — se comparte para no duplicar la aritmética. */
  calculo: PedidoCalculado | null;
  /** Ver `CostosLoteCamposProps.soloCosto` en `costos-lote-campos/index.tsx`. */
  soloCosto?: boolean;
};

/**
 * Bloque "Envases" de "Costos del pedido" (`CostosLoteCampos`): precio por
 * presentación de lo que le pagás al proveedor y, salvo `soloCosto`, un segundo
 * campo con el precio para el costo de la botella (0053).
 */
export function EnvasesBlock({ items, value, onChange, ivaPctNum, calculo, soloCosto = false }: EnvasesBlockProps) {
  const proveedor = useProveedor();

  function setEnvase(productoId: string, monto: string) {
    onChange({
      ...value,
      envasePorProducto: { ...value.envasePorProducto, [productoId]: monto },
    });
  }

  function setEnvaseCosto(productoId: string, monto: string) {
    onChange({
      ...value,
      envaseCostoPorProducto: { ...value.envaseCostoPorProducto, [productoId]: monto },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
        Envases
      </span>
      {/* Fran (dueño): en un mismo pedido todos los envases van iguales
          (con o sin IVA) — UN solo tilde para toda la sección, no uno por
          presentación (antes confundía: tocar uno cambiaba todos igual,
          pero parecía que cada envase tenía su propio IVA). */}
      <div className="flex flex-col gap-0.5">
        <label className="flex min-h-11 items-center gap-2.5 text-[13px] text-text">
          <input
            type="checkbox"
            checked={value.envaseSinIva}
            onChange={(event) => onChange({ ...value, envaseSinIva: event.target.checked })}
            className="h-4 w-4 shrink-0"
          />
          {soloCosto ? "Para el costo, los envases son sin IVA" : `${proveedor.sujeto} te cobra los envases sin IVA`}
        </label>
        <p className="pl-[34px] text-[11px] leading-[1.5] text-text-muted">
          {soloCosto
            ? "Al costo de reposición se le suma el 21% de IVA."
            : `Al costo de cada botella se le suma el 21% de IVA — no a lo que le pagás ${proveedor.a}.`}
        </p>
      </div>

      {items.map((item) => {
        const envaseCalculado = calculo?.envases.find((e) => e.productoId === item.productoId) ?? null;
        const precioCargado = parseCampo(value.envasePorProducto[item.productoId] ?? "");
        const precioCostoCargado = parseCampo(value.envaseCostoPorProducto[item.productoId] ?? "");
        return (
          <div key={item.productoId} className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0">
            <span className="text-[12px] font-medium text-text">
              {formatPresentacion(item.presentacionMl)}
            </span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1">
                <MoneyField
                  id={`precio-envase-${item.productoId}`}
                  label={soloCosto ? "Precio para el costo" : `Lo que le pagás ${proveedor.a}`}
                  value={value.envasePorProducto[item.productoId] ?? ""}
                  onChange={(v) => setEnvase(item.productoId, v)}
                  hint={
                    soloCosto
                      ? "Con este precio se calcula el costo de reposición de la botella."
                      : "Precio por envase. Es lo que sale de la Cuenta Ananja."
                  }
                />
                {envaseCalculado && precioCargado !== null && (
                  <p className="pl-1 text-[11px] leading-snug tabular-nums text-text-muted">
                    {soloCosto
                      ? cuentaEnvaseCampo(
                          envaseCalculado.cantidad,
                          precioCargado,
                          envaseCalculado.totalCentavos,
                          ivaPctNum,
                          value.envaseSinIva,
                        )
                      : cuentaEnvaseCampo(
                          envaseCalculado.cantidad,
                          precioCargado,
                          envaseCalculado.calculadoCentavos,
                          ivaPctNum,
                          false,
                        )}
                  </p>
                )}
              </div>
              {!soloCosto && (
                <div className="flex flex-1 flex-col gap-1">
                  <MoneyField
                    id={`precio-envase-costo-${item.productoId}`}
                    label="Precio para el costo de la botella"
                    value={value.envaseCostoPorProducto[item.productoId] ?? ""}
                    onChange={(v) => setEnvaseCosto(item.productoId, v)}
                    hint={`Con este precio se calcula cuánto cuesta cada botella: lo que les cobrás a las revendedoras y tu ganancia. No cambia lo que le pagás ${proveedor.a}. Vacío = usa el mismo que le pagás.`}
                  />
                  {envaseCalculado && envaseCalculado.totalCentavos > 0 && (
                    <p className="pl-1 text-[11px] leading-snug tabular-nums text-text-muted">
                      {cuentaEnvaseCampo(
                        envaseCalculado.cantidad,
                        precioCostoCargado ?? precioCargado ?? 0,
                        envaseCalculado.totalCentavos,
                        ivaPctNum,
                        value.envaseSinIva,
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
