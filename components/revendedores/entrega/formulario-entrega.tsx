import { CantidadStepper } from "@/components/cantidad-stepper";
import { AccionesForm } from "@/components/ui/acciones-form";
import { Aviso } from "@/components/ui/aviso";
import { AreaTexto, Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import { Segmentos } from "@/components/ui/segmentos";
import { DevolucionProductos } from "@/components/revendedores/entrega/devolucion-productos";
import { SelectorLote, type FilaLote } from "@/components/lotes/selector-lote";
import type { PedidoEnPoder } from "@/lib/dominio/devolucion";
import {
  lotesDeProducto,
  type LoteConStockDeProducto,
} from "@/lib/dominio/lotes-disponibles";
import { envase } from "@/lib/negocio";
import type { Tables } from "@/lib/types";

/** Paso 1 de `EntregaForm`: tipo (Entrega/Devolución), cantidades por
 * producto con su split por lote (`SelectorLote`), fecha y nota. Se oculta
 * (no se desmonta) durante la revisión, para conservar el split cargado. */
export function FormularioEntrega({
  revisando,
  vendedorNombre,
  soloDevolucion,
  soloEntrega = false,
  tipo,
  onCambiarTipo,
  productos,
  cantidades,
  onCambiarCantidad,
  pedidosEnPoder,
  devolucion,
  onCambiarDevolucion,
  onDevolverTodo,
  onDevolverTodoDeProducto,
  lotesConStock,
  ultimoLotePorProducto,
  onLotesChange,
  fecha,
  onCambiarFecha,
  nota,
  onCambiarNota,
  error,
  saving,
  onSubmit,
  cancelarHref,
}: {
  revisando: boolean;
  vendedorNombre: string;
  soloDevolucion: boolean;
  /** Oculta el chip Entrega/Devolución (entrega de feria: tipo fijo). */
  soloEntrega?: boolean;
  tipo: "entrega" | "devolucion";
  onCambiarTipo: (tipo: "entrega" | "devolucion") => void;
  productos: Tables<"productos">[];
  cantidades: Record<string, number>;
  onCambiarCantidad: (productoId: string, value: number) => void;
  /** Devolución por pedido (ver `DevolucionProductos`); sin esto, el flujo de siempre. */
  pedidosEnPoder?: Record<string, PedidoEnPoder[]>;
  devolucion: Record<string, number>;
  onCambiarDevolucion: (clave: string, value: number) => void;
  onDevolverTodo: () => void;
  onDevolverTodoDeProducto: (productoId: string) => void;
  lotesConStock: LoteConStockDeProducto[];
  ultimoLotePorProducto: Record<string, string>;
  onLotesChange: (productoId: string, filas: FilaLote[]) => void;
  fecha: string;
  onCambiarFecha: (fecha: string) => void;
  nota: string;
  onCambiarNota: (nota: string) => void;
  error: string | null;
  saving: boolean;
  onSubmit: () => void;
  /** A dónde vuelve "Cancelar". */
  cancelarHref: string;
}) {
  const devolucionPorPedido =
    tipo === "devolucion" && pedidosEnPoder !== undefined;

  return (
    <form
      hidden={revisando}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-5"
    >
      {!soloDevolucion && !soloEntrega && (
        <Segmentos
          opciones={[
            { value: "entrega", label: "Entrega" },
            { value: "devolucion", label: "Devolución" },
          ]}
          valor={tipo}
          onChange={onCambiarTipo}
        />
      )}

      <SeccionForm
        titulo={
          tipo === "devolucion"
            ? `¿Qué botellas devolvió ${vendedorNombre}?`
            : `¿Qué botellas le entregás a ${vendedorNombre}?`
        }
        descripcion="Cantidades por tamaño."
      >
        {devolucionPorPedido && (
          <DevolucionProductos
            vendedorNombre={vendedorNombre}
            productos={productos}
            pedidosEnPoder={pedidosEnPoder}
            cantidades={devolucion}
            onCambiarCantidad={onCambiarDevolucion}
            onDevolverTodo={onDevolverTodo}
            onDevolverTodoDeProducto={onDevolverTodoDeProducto}
          />
        )}

        {tipo === "devolucion" && !devolucionPorPedido && (
          <Aviso>
            <p>
              Elegí siempre el pedido del que salieron esas {envase(2)}. Por
              defecto aparece el de la última entrega a {vendedorNombre}.
            </p>
          </Aviso>
        )}

        {!devolucionPorPedido && (
          <div className="flex flex-col">
            {productos.map((producto) => {
              const cantidad = cantidades[producto.id] ?? 0;
              return (
                <div
                  key={producto.id}
                  className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-[16px] text-text">
                      {producto.nombre}
                    </span>
                    <CantidadStepper
                      value={cantidad}
                      onChange={(value) =>
                        onCambiarCantidad(producto.id, value)
                      }
                      ariaLabelSufijo={` de ${producto.nombre}`}
                      disableAtMin={false}
                    />
                  </div>
                  {cantidad > 0 && (
                    <SelectorLote
                      // `tipo` cambia el modo de reparto por default (spend
                      // FIFO vs. lote preferido) — un `key` distinto por tipo
                      // fuerza a remontar el selector en vez de arrastrar un
                      // split pensado para el otro modo.
                      key={tipo}
                      cantidad={cantidad}
                      lotes={lotesDeProducto(lotesConStock, producto.id)}
                      onChange={(filas) => onLotesChange(producto.id, filas)}
                      loteIdPreferido={
                        tipo === "devolucion"
                          ? (ultimoLotePorProducto[producto.id] ?? null)
                          : undefined
                      }
                      ariaLabelSufijo={` de ${producto.nombre}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SeccionForm>

      <SeccionForm titulo="¿Cuándo fue?">
        <Campo id="fecha" etiqueta="Fecha">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(event) => onCambiarFecha(event.target.value)}
            className="tabular-nums"
          />
        </Campo>

        <Campo id="nota" etiqueta="Nota" opcional>
          <AreaTexto
            value={nota}
            onChange={(event) => onCambiarNota(event.target.value)}
            rows={2}
          />
        </Campo>
      </SeccionForm>

      {error && !revisando && <MensajeError>{error}</MensajeError>}

      <AccionesForm
        etiqueta={tipo === "entrega" ? "Revisar entrega" : "Guardar devolución"}
        cargando={saving}
        cancelarHref={cancelarHref}
        fija
      />
    </form>
  );
}
