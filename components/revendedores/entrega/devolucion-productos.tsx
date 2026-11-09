import { CantidadStepper } from "@/components/cantidad-stepper";
import { Boton } from "@/components/ui/boton";
import { Aviso } from "@/components/ui/aviso";
import {
  claveDevolucion,
  totalEnPoder,
  type PedidoEnPoder,
} from "@/lib/dominio/devolucion";
import { formatFechaSinAnio } from "@/lib/fechas";
import { envase } from "@/lib/negocio";
import type { Tables } from "@/lib/types";

/**
 * Paso 1 de la devolución: por cada producto, SOLO los pedidos de los que la
 * revendedora tiene botellas en poder ("Pedido del 15 · tiene 40"), cada uno
 * con su stepper (tope = lo que tiene) y un "Devolver todo" que llena todo
 * de una. Un producto sin botellas en poder no se ofrece.
 */
export function DevolucionProductos({
  vendedorNombre,
  productos,
  pedidosEnPoder,
  cantidades,
  onCambiarCantidad,
  onDevolverTodo,
  onDevolverTodoDeProducto,
}: {
  vendedorNombre: string;
  productos: Tables<"productos">[];
  pedidosEnPoder: Record<string, PedidoEnPoder[]>;
  cantidades: Record<string, number>;
  onCambiarCantidad: (clave: string, value: number) => void;
  onDevolverTodo: () => void;
  onDevolverTodoDeProducto: (productoId: string) => void;
}) {
  const conStock = productos.filter(
    (p) => (pedidosEnPoder[p.id]?.length ?? 0) > 0,
  );

  if (conStock.length === 0) {
    return (
      <Aviso>
        <p>
          {vendedorNombre} no tiene {envase(2)} en poder para devolver.
        </p>
      </Aviso>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Boton variante="secundario" onClick={onDevolverTodo}>
        Devolver todo
      </Boton>

      <div className="flex flex-col">
        {conStock.map((producto) => {
          const pedidos = pedidosEnPoder[producto.id] ?? [];
          return (
            <div
              key={producto.id}
              className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-[16px] font-semibold text-text">
                  {producto.nombre} · tiene {totalEnPoder(pedidos)}
                </span>
                {pedidos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDevolverTodoDeProducto(producto.id)}
                    className="shrink-0 text-[14px] font-semibold text-accent"
                  >
                    Devolver todo
                  </button>
                )}
              </div>
              {pedidos.map((pedido) => {
                const clave = claveDevolucion(producto.id, pedido.loteId);
                const cantidad = cantidades[clave] ?? 0;
                return (
                  <div
                    key={pedido.loteId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 text-[14px] text-text">
                      Pedido del {formatFechaSinAnio(pedido.fecha)} · tiene{" "}
                      {pedido.enPoder}
                    </span>
                    <div className="shrink-0">
                      <CantidadStepper
                        value={cantidad}
                        onChange={(value) => onCambiarCantidad(clave, value)}
                        max={pedido.enPoder}
                        size="sm"
                        disableAtMin={false}
                        ariaLabelSufijo={` del pedido del ${formatFechaSinAnio(pedido.fecha)} de ${producto.nombre}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
