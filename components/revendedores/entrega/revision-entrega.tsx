import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { AvisoCargaRepetida } from "@/components/revendedores/aviso-carga-repetida";
import type { FilaRevision } from "@/components/revendedores/entrega/tipos";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos, parseMontoInput } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";
import type { CargaParecida } from "@/lib/dominio/cargas-parecidas";

/** Paso 2 de `EntregaForm`, solo para una entrega (no una devolución):
 * "Revisá la entrega" — por cada producto y lote, el costo Ananja del lote
 * (solo lectura), lo que se le cobra a la revendedora (editable, precargado
 * con ese costo) y el precio de venta sugerido (editable, precargado con el
 * minorista sugerido del lote). */
export function RevisionEntrega({
  vendedorNombre,
  fecha,
  filas,
  nombrePorProducto,
  loteDe,
  onActualizarFila,
  totalCentavos,
  error,
  saving,
  avisoParecidas,
  avisoBuscando,
  onAvisoGuardarIgual,
  onAvisoRevisar,
  onConfirmar,
  onVolverAEditar,
}: {
  vendedorNombre: string;
  fecha: string;
  filas: FilaRevision[];
  nombrePorProducto: Map<string, string>;
  loteDe: (productoId: string, loteId: string | null) => LoteConStockDeProducto | undefined;
  onActualizarFila: (clave: string, campo: "costo" | "sugerido", valor: string) => void;
  totalCentavos: number;
  error: string | null;
  saving: boolean;
  avisoParecidas: CargaParecida[] | null;
  avisoBuscando: boolean;
  onAvisoGuardarIgual: () => void;
  onAvisoRevisar: () => void;
  onConfirmar: () => void;
  onVolverAEditar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-text-muted">
        Para <span className="font-medium text-text">{vendedorNombre}</span> · {formatFecha(fecha)}.
        Revisá cuánto le cobrás por cada {envase(1)} que venda y a cuánto le sugerimos venderla.
      </p>

      <div className="flex flex-col">
        {filas.map((fila) => {
          const lote = loteDe(fila.productoId, fila.loteId);
          const costo = parseMontoInput(fila.costo);
          const sugerido = parseMontoInput(fila.sugerido);
          return (
            <div key={fila.clave} className="flex flex-col gap-3 border-b border-border py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words text-[15px] font-medium text-text">
                  {nombrePorProducto.get(fila.productoId) ?? "?"}
                </span>
                <span className="shrink-0 tabular-nums text-text">
                  {fila.cantidad} {envase(fila.cantidad)}
                </span>
              </div>
              <span className="text-[11px] text-text-muted">
                {lote ? `Lote del ${formatFecha(lote.fecha)}` : "Sin lote elegido"}
              </span>

              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-text-muted">Costo {NEGOCIO.nombre} (lote)</span>
                <span className="shrink-0 tabular-nums text-text">
                  {fila.costoLote !== null ? formatCentavos(fila.costoLote) : "Sin costo cargado"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MontoInput
                  id={`costo-${fila.clave}`}
                  label="Le cobrás a la revendedora"
                  value={fila.costo}
                  onChange={(value) => onActualizarFila(fila.clave, "costo", value)}
                  required
                  placeholder="$ 0,00"
                  simbolo={null}
                  labelClassName="block text-[10px] tracking-[0.18em] text-text-muted uppercase"
                  cajaClassName="mt-1.5 flex items-center border border-border bg-surface px-3 focus-within:border-primary"
                  inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none"
                />
                <MontoInput
                  id={`sugerido-${fila.clave}`}
                  label="Precio de venta sugerido"
                  value={fila.sugerido}
                  onChange={(value) => onActualizarFila(fila.clave, "sugerido", value)}
                  placeholder="$ 0,00"
                  simbolo={null}
                  labelClassName="block text-[10px] tracking-[0.18em] text-text-muted uppercase"
                  cajaClassName="mt-1.5 flex items-center border border-border bg-surface px-3 focus-within:border-primary"
                  inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none"
                />
              </div>

              {fila.sinCostosDelLote && (
                <p className="text-[11px] text-accent">
                  {lote
                    ? "Este lote todavía no tiene costos cargados: completá a mano cuánto le cobrás."
                    : "Sin lote no hay costo para precargar: completá a mano cuánto le cobrás."}
                </p>
              )}
              {costo !== null && sugerido !== null && sugerido < costo && (
                <p className="text-[11px] text-accent">
                  Ojo: el precio sugerido es menor a lo que le cobrás.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-sm text-text">
        Si vende todo, le va a deber{" "}
        <span className="font-medium tabular-nums">{formatCentavos(totalCentavos)}</span>.
      </p>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      {avisoParecidas ? (
        <AvisoCargaRepetida
          parecidas={avisoParecidas}
          cargando={saving}
          onGuardarIgual={onAvisoGuardarIgual}
          onRevisar={onAvisoRevisar}
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <BotonAccion
            cargando={saving || avisoBuscando}
            textoCargando="Guardando…"
            type="button"
            onClick={onConfirmar}
            className="flex min-h-[54px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            Confirmar entrega
          </BotonAccion>
          <button
            type="button"
            onClick={onVolverAEditar}
            disabled={saving || avisoBuscando}
            className="flex min-h-[54px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Volver a editar
          </button>
        </div>
      )}
    </div>
  );
}
