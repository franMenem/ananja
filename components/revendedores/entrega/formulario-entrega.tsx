import { BotonAccion } from "@/components/boton-accion";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { SelectorLote, type FilaLote } from "@/components/lotes/selector-lote";
import { lotesDeProducto, type LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { envase } from "@/lib/negocio";
import type { Tables } from "@/lib/types";

/** Paso 1 de `EntregaForm`: tipo (Entrega/Devolución), cantidades por
 * producto con su split por lote (`SelectorLote`), fecha y nota. Se oculta
 * (no se desmonta) durante la revisión, para conservar el split cargado. */
export function FormularioEntrega({
  revisando,
  vendedorNombre,
  soloDevolucion,
  tipo,
  onCambiarTipo,
  productos,
  cantidades,
  onCambiarCantidad,
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
}: {
  revisando: boolean;
  vendedorNombre: string;
  soloDevolucion: boolean;
  tipo: "entrega" | "devolucion";
  onCambiarTipo: (tipo: "entrega" | "devolucion") => void;
  productos: Tables<"productos">[];
  cantidades: Record<string, number>;
  onCambiarCantidad: (productoId: string, value: number) => void;
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
}) {
  return (
    <form
      hidden={revisando}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-xs text-text-muted">
        Para <span className="font-medium text-text">{vendedorNombre}</span>
      </p>

      {!soloDevolucion && (
        <div className="flex gap-px bg-border">
          <button
            type="button"
            onClick={() => onCambiarTipo("entrega")}
            aria-pressed={tipo === "entrega"}
            className={`min-h-11 flex-1 px-3 text-sm font-medium ${
              tipo === "entrega" ? "bg-primary text-background" : "bg-surface-raised text-text"
            }`}
          >
            Entrega
          </button>
          <button
            type="button"
            onClick={() => onCambiarTipo("devolucion")}
            aria-pressed={tipo === "devolucion"}
            className={`min-h-11 flex-1 px-3 text-sm font-medium ${
              tipo === "devolucion" ? "bg-primary text-background" : "bg-surface-raised text-text"
            }`}
          >
            Devolución
          </button>
        </div>
      )}

      {tipo === "devolucion" && (
        <p className="text-xs text-accent">
          Elegí siempre el lote del que salieron esas {envase(2)}. Por defecto aparece el de la
          última entrega a {vendedorNombre}.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Cantidades por producto
        </span>
        {productos.map((producto) => {
          const cantidad = cantidades[producto.id] ?? 0;
          return (
            <div key={producto.id} className="flex flex-col gap-2 border-b border-border py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-text">{producto.nombre}</span>
                <CantidadStepper
                  value={cantidad}
                  onChange={(value) => onCambiarCantidad(producto.id, value)}
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
                    tipo === "devolucion" ? (ultimoLotePorProducto[producto.id] ?? null) : undefined
                  }
                  ariaLabelSufijo={` de ${producto.nombre}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor="fecha" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Fecha
        </label>
        <input
          id="fecha"
          type="date"
          required
          value={fecha}
          onChange={(event) => onCambiarFecha(event.target.value)}
          className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="nota" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Nota (opcional)
        </label>
        <textarea
          id="nota"
          value={nota}
          onChange={(event) => onCambiarNota(event.target.value)}
          rows={2}
          className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
        />
      </div>

      {error && !revisando && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <BotonAccion
        cargando={saving}
        textoCargando="Guardando…"
        type="submit"
        className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        {tipo === "entrega" ? "Revisar entrega" : "Guardar"}
      </BotonAccion>
    </form>
  );
}
