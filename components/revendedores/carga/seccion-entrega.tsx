import { CantidadStepper } from "@/components/cantidad-stepper";
import { MontoInput } from "@/components/monto-input";
import { CAJA_MONTO, CAMPO, INPUT_MONTO, ListaProblemas, ROTULO, Seccion } from "@/components/revendedores/carga/ui";
import type { FilaEntregaEstado } from "@/components/revendedores/carga/tipos";
import type { ProblemaCarga } from "@/lib/dominio/carga-revendedor";
import { formatFecha } from "@/lib/fechas";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { formatCentavos, parseMontoInput } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";

/** Sección 1 · Entrega de `CargaForm`: una fila por presentación con el
 * lote (precargado por fecha, o elegido a mano), lo que le cobrás y el
 * precio de venta sugerido. */
export function SeccionEntrega({
  activa,
  onToggle,
  hoy,
  fecha,
  onCambiarFecha,
  productos,
  lotes,
  filas,
  onActualizarFila,
  onCambiarLote,
  botellasEntregadas,
  problemas,
}: {
  activa: boolean;
  onToggle: () => void;
  hoy: string;
  fecha: string;
  onCambiarFecha: (fecha: string) => void;
  productos: { id: string; nombre: string }[];
  lotes: LoteConStockDeProducto[];
  filas: Record<string, FilaEntregaEstado>;
  onActualizarFila: (productoId: string, cambio: Partial<FilaEntregaEstado>) => void;
  onCambiarLote: (productoId: string, loteId: string | null) => void;
  botellasEntregadas: number;
  problemas: ProblemaCarga[];
}) {
  return (
    <Seccion
      numero={1}
      titulo="Entrega"
      activa={activa}
      onToggle={onToggle}
      descripcion={
        activa
          ? `${botellasEntregadas} ${envase(botellasEntregadas)} · ${formatFecha(fecha || hoy)}`
          : `Las ${envase(2)} que le diste y de qué lote`
      }
    >
      <div>
        <label htmlFor="fecha-entrega" className={ROTULO}>
          Fecha de la entrega
        </label>
        <input
          id="fecha-entrega"
          type="date"
          required
          max={hoy}
          value={fecha}
          onChange={(event) => onCambiarFecha(event.target.value)}
          className={CAMPO}
        />
      </div>

      {productos.map((p) => {
        const f = filas[p.id];
        const lotesProducto = lotes
          .filter((l) => l.productoId === p.id)
          .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
        const lote = f.loteId ? lotesProducto.find((l) => l.loteId === f.loteId) : undefined;
        const costo = parseMontoInput(f.costo);
        const sugerido = parseMontoInput(f.sugerido);
        const costoLote = lote?.costoAnanjaCentavos ?? null;
        return (
          <div key={p.id} className="flex flex-col gap-3 border-b border-border pb-4">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 break-words text-[15px] text-text">{p.nombre}</span>
              <CantidadStepper
                value={f.cantidad}
                onChange={(value) => onActualizarFila(p.id, { cantidad: value })}
                disableAtMin={false}
                ariaLabelSufijo={` entregadas de ${p.nombre}`}
              />
            </div>
            {f.cantidad > 0 && (
              <>
                <div>
                  <label htmlFor={`lote-${p.id}`} className={ROTULO}>
                    Lote
                  </label>
                  <select
                    id={`lote-${p.id}`}
                    value={f.loteId ?? ""}
                    onChange={(event) => onCambiarLote(p.id, event.target.value || null)}
                    className={CAMPO}
                  >
                    {lotesProducto.map((l) => (
                      <option key={l.loteId} value={l.loteId}>
                        Lote del {formatFecha(l.fecha)} ·{" "}
                        {l.quedan > 0 ? `quedan ${l.quedan}` : "sin stock ahora"}
                      </option>
                    ))}
                    <option value="">Sin lote</option>
                  </select>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-text-muted">Costo {NEGOCIO.nombre} (lote)</span>
                  <span className="shrink-0 tabular-nums text-text">
                    {costoLote !== null ? formatCentavos(costoLote) : "Sin costo cargado"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <MontoInput
                    id={`costo-${p.id}`}
                    label="Le cobrás a la revendedora"
                    value={f.costo}
                    onChange={(value) => onActualizarFila(p.id, { costo: value })}
                    required
                    placeholder="$ 0,00"
                    simbolo={null}
                    labelClassName={`block ${ROTULO}`}
                    cajaClassName={CAJA_MONTO}
                    inputClassName={INPUT_MONTO}
                  />
                  <MontoInput
                    id={`sugerido-${p.id}`}
                    label="Precio de venta sugerido"
                    value={f.sugerido}
                    onChange={(value) => onActualizarFila(p.id, { sugerido: value })}
                    placeholder="$ 0,00"
                    simbolo={null}
                    labelClassName={`block ${ROTULO}`}
                    cajaClassName={CAJA_MONTO}
                    inputClassName={INPUT_MONTO}
                  />
                </div>
                {(!lote || lote.costoAnanjaCentavos === null) && (
                  <p className="text-[11px] text-accent">
                    {lote
                      ? "Este lote todavía no tiene costos cargados: completá a mano cuánto le cobrás."
                      : "Sin lote no hay costo para precargar: completá a mano cuánto le cobrás."}
                  </p>
                )}
                {lote && fecha && lote.fecha > fecha && (
                  <p className="text-[11px] text-accent">
                    Ojo: este lote es del {formatFecha(lote.fecha)}, posterior a la fecha de la
                    entrega.
                  </p>
                )}
                {lote && lote.quedan < f.cantidad && (
                  <p className="text-[11px] text-accent">
                    En el sistema quedan {Math.max(lote.quedan, 0)} de este lote. Si igual se
                    las llevó, al confirmar te preguntamos.
                  </p>
                )}
                {costo !== null && sugerido !== null && sugerido < costo && (
                  <p className="text-[11px] text-accent">
                    Ojo: el precio sugerido es menor a lo que le cobrás.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      <ListaProblemas problemas={problemas} />
    </Seccion>
  );
}
