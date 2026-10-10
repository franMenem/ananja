import { CantidadStepper } from "@/components/cantidad-stepper";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import {
  CAJA_MONTO,
  CAMPO,
  INPUT_MONTO,
  LINK_CHICO,
  ListaProblemas,
  ROTULO,
  Seccion,
} from "@/components/revendedores/carga/ui";
import type { LineaVentaEstado } from "@/components/revendedores/carga/tipos";
import { yaTeniaAntesDeLaEntrega, type MedioPago, type ProblemaCarga } from "@/lib/dominio/carga-revendedor";
import { formatFecha } from "@/lib/fechas";
import { envase } from "@/lib/negocio";
import { lotesConStockRevendedora, type TramoStock } from "@/lib/dominio/revendedor-stock";

/** Sección 2 · Ventas de `CargaForm`: lo que vendió de cada presentación que
 * va a tener (stock existente + la entrega que se está cargando), con
 * "Vender todo", varias líneas por producto (con o sin precio) y, si hay más
 * de un lote con stock, el lote del que salió (0062). */
export function SeccionVentas({
  activa,
  onToggle,
  hoy,
  fechaEfectiva,
  fechaSinDefault,
  onCambiarFecha,
  conEntrega,
  vendedorNombre,
  tomaDirecto,
  delDeposito,
  productos,
  disponible,
  entregado,
  tramos,
  lineas,
  fechaLotePorId,
  onActualizarLinea,
  onAgregarLinea,
  onQuitarLinea,
  onVenderTodo,
  medioPago,
  onCambiarMedioPago,
  vendidas,
  problemas,
}: {
  activa: boolean;
  onToggle: () => void;
  hoy: string;
  fechaEfectiva: string;
  /** Fecha cruda elegida a mano, `null` = sigue la de la entrega (o hoy). */
  fechaSinDefault: string | null;
  onCambiarFecha: (fecha: string) => void;
  conEntrega: boolean;
  vendedorNombre: string;
  /** "Agarra directo del depósito" (0073): se ofrecen todos los productos y
   * lo que falte se saca del depósito (aviso, no problema). */
  tomaDirecto: boolean;
  /** Botellas que se van a sacar del depósito, por producto. */
  delDeposito: { productoId: string; cantidad: number }[];
  productos: { id: string; nombre: string }[];
  disponible: Record<string, number>;
  entregado: Record<string, number>;
  tramos: TramoStock[];
  lineas: Record<string, LineaVentaEstado[]>;
  fechaLotePorId: Record<string, string>;
  onActualizarLinea: (productoId: string, lineaId: string, cambio: Partial<LineaVentaEstado>) => void;
  onAgregarLinea: (productoId: string) => void;
  onQuitarLinea: (productoId: string, lineaId: string) => void;
  onVenderTodo: (productoId: string, total: number) => void;
  medioPago: MedioPago | null;
  onCambiarMedioPago: (medio: MedioPago | null) => void;
  vendidas: number;
  problemas: ProblemaCarga[];
}) {
  const productosVenta = productos.filter(
    (p) => tomaDirecto || (disponible[p.id] ?? 0) > 0 || lineas[p.id].some((l) => l.cantidad > 0),
  );

  return (
    <Seccion
      numero={2}
      titulo="Ventas"
      activa={activa}
      onToggle={onToggle}
      descripcion={
        activa
          ? `${vendidas} vendidas · ${formatFecha(fechaEfectiva || hoy)}`
          : "Lo que vendió, con o sin precio"
      }
    >
      <div>
        <label htmlFor="fecha-ventas" className={ROTULO}>
          Fecha de las ventas
        </label>
        <input
          id="fecha-ventas"
          type="date"
          required
          max={hoy}
          value={fechaEfectiva}
          onChange={(event) => onCambiarFecha(event.target.value)}
          className={CAMPO}
        />
        {conEntrega && fechaSinDefault === null && (
          <p className="mt-1 text-[11px] text-text-muted">La misma fecha de la entrega.</p>
        )}
      </div>

      {tomaDirecto && (
        <p className="text-[12px] text-text-muted">
          {vendedorNombre} agarra directo del depósito: lo que venda de más de lo que tiene se saca
          solo del depósito y queda anotado como entrega automática.
        </p>
      )}

      {productosVenta.length === 0 ? (
        <p className="text-sm text-text-muted">
          {vendedorNombre} no tiene {envase(2)} para vender.
          {!conEntrega && " Si se llevó algunas, sumá la entrega arriba."}
        </p>
      ) : (
        productosVenta.map((p) => {
          const lineasProducto = lineas[p.id];
          const disp = disponible[p.id] ?? 0;
          const deEstaEntrega = entregado[p.id] ?? 0;
          const total = deEstaEntrega > 0 ? deEstaEntrega : disp;
          const yaTenia =
            deEstaEntrega > 0 ? yaTeniaAntesDeLaEntrega(tramos, p.id, deEstaEntrega) : 0;
          // Solo tiene sentido elegir si hay más de un lote con stock —
          // con uno solo, "Automático" ya sale de ahí (0062).
          const lotesProductoVenta = lotesConStockRevendedora(tramos, p.id);
          return (
            <div key={p.id} className="flex flex-col gap-3 border-b border-border pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 break-words text-[15px] text-text">{p.nombre}</span>
                <span className="text-[11px] text-text-muted">
                  Va a tener {disp}
                  {deEstaEntrega > 0 ? ` (${deEstaEntrega} de esta entrega)` : ""}
                </span>
              </div>
              {lineasProducto.map((l, i) => (
                <div key={l.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-text-muted">
                      {i === 0 ? "Vendidas" : "Otras vendidas"}
                    </span>
                    <CantidadStepper
                      value={l.cantidad}
                      onChange={(value) => onActualizarLinea(p.id, l.id, { cantidad: value })}
                      disableAtMin={false}
                      ariaLabelSufijo={` vendidas de ${p.nombre}${i > 0 ? ` (${i + 1})` : ""}`}
                    />
                  </div>
                  {i === 0 && total > 0 && (
                    <button
                      type="button"
                      onClick={() => onVenderTodo(p.id, total)}
                      className={`self-end text-primary ${LINK_CHICO}`}
                    >
                      {deEstaEntrega === 0
                        ? `Todas las que tiene (${disp})`
                        : yaTenia > 0
                          ? `Vender ${deEstaEntrega} (primero salen las ${yaTenia} que ya tenía)`
                          : `Todo lo entregado (${deEstaEntrega})`}
                    </button>
                  )}
                  {l.cantidad > 0 && (
                    <>
                      {lotesProductoVenta.length > 1 && (
                        <div>
                          <label htmlFor={`lote-venta-${l.id}`} className={ROTULO}>
                            Lote
                          </label>
                          <select
                            id={`lote-venta-${l.id}`}
                            value={l.loteId ?? ""}
                            onChange={(event) =>
                              onActualizarLinea(p.id, l.id, { loteId: event.target.value || null })
                            }
                            className={CAMPO}
                          >
                            <option value="">Automático (primero lo más viejo)</option>
                            {lotesProductoVenta.map((lo) => (
                              <option key={lo.loteId} value={lo.loteId}>
                                Lote del {formatFecha(fechaLotePorId[lo.loteId] ?? lo.fecha)} · quedan{" "}
                                {lo.quedan}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <MontoInput
                        id={`precio-${l.id}`}
                        label={`¿A cuánto la vendió? (por ${envase(1)})`}
                        disabled={l.sinPrecio}
                        value={l.sinPrecio ? "" : l.precio}
                        onChange={(value) => onActualizarLinea(p.id, l.id, { precio: value })}
                        placeholder="$ 0,00"
                        simbolo={null}
                        labelClassName={`block ${ROTULO}`}
                        cajaClassName={`${CAJA_MONTO} ${l.sinPrecio ? "opacity-45" : ""}`}
                        inputClassName={INPUT_MONTO}
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm text-text">
                        <input
                          type="checkbox"
                          checked={l.sinPrecio}
                          onChange={(event) =>
                            onActualizarLinea(p.id, l.id, { sinPrecio: event.target.checked })
                          }
                          className="h-5 w-5 accent-[var(--color-primary)]"
                        />
                        No sé a cuánto la vendió
                      </label>
                    </>
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => onQuitarLinea(p.id, l.id)}
                      className={`self-start text-text-muted ${LINK_CHICO}`}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {lineasProducto.some((l) => l.cantidad > 0) && (
                <button
                  type="button"
                  onClick={() => onAgregarLinea(p.id)}
                  className={`self-start text-primary ${LINK_CHICO}`}
                >
                  + Otras a otro precio o sin precio
                </button>
              )}
            </div>
          );
        })
      )}

      {delDeposito.length > 0 && (
        <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
          {delDeposito.map((d) => (
            <p key={d.productoId} className="text-text">
              {d.cantidad} {envase(d.cantidad)} de{" "}
              {productos.find((p) => p.id === d.productoId)?.nombre ?? "un producto"} se van a sacar
              del depósito.
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <MedioPagoChips value={medioPago} onChange={onCambiarMedioPago} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-muted">Medio de pago opcional</span>
          {medioPago !== null && (
            <button
              type="button"
              onClick={() => onCambiarMedioPago(null)}
              className={`text-text-muted ${LINK_CHICO}`}
            >
              No sé cómo le pagaron
            </button>
          )}
        </div>
      </div>

      <ListaProblemas problemas={problemas} />
    </Seccion>
  );
}
