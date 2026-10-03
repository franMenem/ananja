"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { SetFormHeader } from "@/components/page-header-context";
import { formatFecha, hoyISO } from "@/lib/fechas";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { NEGOCIO, concordar, envase } from "@/lib/negocio";
import {
  atribuirVenta,
  costoTotalVenta,
  gananciaVenta,
  vendeBajoCosto,
  type TramoStock,
} from "@/lib/dominio/revendedor-stock";
import { registrarVentaRevendedor } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";
import type { Enums, Tables } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

// `v_productos_publicos` reporta `id` como nullable en los tipos generados
// (toda vista lo hace), pero es la PK de `productos` — nunca es null en la
// práctica. Se fuerza acá a `string` para no ensuciar el resto del
// componente con `?`/`!`; `nombre`/`presentacion_ml` quedan nullable.
type ProductoBasico = Omit<
  Pick<Tables<"v_productos_publicos">, "id" | "nombre" | "presentacion_ml">,
  "id"
> & { id: string };

type ProductoDisponible = {
  producto: ProductoBasico;
  enPoder: number;
  /** Entregas con stock de este producto, de la más vieja a la más nueva. */
  tramos: TramoStock[];
  /** Precio revendedor manual — respaldo para entregas sin costo aprobado. */
  precioManualCentavos: number | null;
  ultimoPrecioVentaCentavos: number | null;
};

type StockAlert = {
  producto: string;
  disponible: number;
};

function sugeridoDe(p: ProductoDisponible | undefined): number | null {
  if (!p) return null;
  return p.tramos[0]?.precioSugeridoCentavos ?? p.ultimoPrecioVentaCentavos;
}

function precioInputInicial(centavos: number | null): string {
  return centavos !== null && centavos > 0 ? formatMontoDisplay(centavos) : "";
}

/**
 * "Nueva venta" (`/mi/ventas/nueva`) — producto en chips (solo los que
 * tiene en poder), cantidad con `CantidadStepper` (tope = stock en poder) y
 * "¿A cuánto la vendiste?" precargado con el precio sugerido de la entrega
 * de donde sale la botella. La revendedora no elige lote: se muestra de qué
 * entrega(s) sale (FIFO, mismo reparto que hace `registrar_venta_revendedor`
 * al guardar), cuánto le va a deber a Ananja y cuánto gana; si vende por
 * debajo de lo que le debe, avisa pero deja guardar.
 * `STOCK_REVENDEDOR_INSUFICIENTE` abre un `BottomSheet` SIN "Guardar
 * igual" — acá no hay bypass
 *.
 */
export function VentaForm({ productos }: { productos: ProductoDisponible[] }) {
  const router = useRouter();
  const disponibles = productos.filter((p) => p.enPoder > 0);

  const [productoId, setProductoId] = useState<string | null>(
    disponibles[0]?.producto.id ?? null,
  );
  const [cantidad, setCantidad] = useState(1);
  const [precioVenta, setPrecioVenta] = useState(precioInputInicial(sugeridoDe(disponibles[0])));
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<StockAlert | null>(null);

  const seleccionado = disponibles.find((p) => p.producto.id === productoId) ?? null;

  function handleElegirProducto(id: string) {
    setProductoId(id);
    setCantidad(1);
    setPrecioVenta(precioInputInicial(sugeridoDe(disponibles.find((d) => d.producto.id === id))));
  }

  const precioVentaCentavos = parseMontoInput(precioVenta);
  const sugerido = sugeridoDe(seleccionado ?? undefined);
  // Cálculo en vivo, sin memoizar — aritmética trivial sobre pocas filas.
  const atribucion = seleccionado
    ? atribuirVenta(
        seleccionado.tramos,
        seleccionado.producto.id,
        cantidad,
        seleccionado.precioManualCentavos,
        fecha,
      )
    : null;
  const costoTotal = atribucion ? costoTotalVenta(atribucion.tramos) : null;
  const ganancia =
    atribucion && precioVentaCentavos !== null
      ? gananciaVenta(atribucion.tramos, precioVentaCentavos)
      : null;
  const bajoCosto =
    atribucion !== null &&
    precioVentaCentavos !== null &&
    vendeBajoCosto(atribucion.tramos, precioVentaCentavos);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!seleccionado) {
      setError("Elegí un producto.");
      return;
    }
    if (cantidad < 1 || cantidad > seleccionado.enPoder) {
      setError("Revisá la cantidad.");
      return;
    }
    if (precioVentaCentavos === null || precioVentaCentavos <= 0) {
      setError("Ingresá a cuánto la vendiste.");
      return;
    }
    if (!medioPago) {
      setError("Elegí un medio de pago.");
      return;
    }
    if (atribucion?.entregaPosterior) {
      setError(
        `La venta es del ${formatFecha(fecha)} pero esas ${envase(2)} te las entregaron el ${formatFecha(atribucion.entregaPosterior)}. Revisá la fecha.`,
      );
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await registrarVentaRevendedor(supabase, {
      productoId: seleccionado.producto.id,
      cantidad,
      precioVentaCentavos,
      medioPago,
      fecha,
      nota: nota.trim() || null,
    });

    if (rpcError) {
      if (rpcError.message === "STOCK_REVENDEDOR_INSUFICIENTE") {
        let detalle: { producto?: string; disponible?: number } = {};
        try {
          detalle = JSON.parse((rpcError as { details?: string }).details ?? "{}");
        } catch {
          // sin detalle parseable, se muestra el mensaje genérico igual
        }
        setAlerta({
          producto: detalle.producto ?? "un producto",
          disponible: detalle.disponible ?? 0,
        });
        setSaving(false);
        return;
      }
      if (rpcError.message === "PRECIO_NO_ASIGNADO") {
        setError(`${NEGOCIO.nombre} todavía no te asignó precio para este producto.`);
      } else if (rpcError.message === "CANTIDAD_INVALIDA") {
        setError("Revisá la cantidad.");
      } else if (rpcError.message === "PRECIO_INVALIDO") {
        setError("Ingresá a cuánto la vendiste.");
      } else if (rpcError.message === "FECHA_FUTURA") {
        setError("La fecha de la venta no puede ser posterior a hoy.");
      } else if (rpcError.message === "FECHA_ANTERIOR_A_ENTREGA") {
        setError("La fecha de la venta es anterior a la entrega de esas botellas. Revisá la fecha.");
      } else if (rpcError.message === "NO_AUTORIZADO") {
        setError("No tenés permiso para esto.");
      } else {
        setError("No se pudo guardar la venta. Probá de nuevo.");
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/mi/ventas");
    router.refresh();
  }

  if (disponibles.length === 0) {
    return (
      <>
        <SetFormHeader title="Nueva venta" backHref="/mi/ventas" backLabel="Volver a ventas" />
        <p className="text-sm text-text-muted">
          Todavía no tenés {NEGOCIO.envase.plural} para vender.
        </p>
      </>
    );
  }

  return (
    <>
      <SetFormHeader title="Nueva venta" backHref="/mi/ventas" backLabel="Volver a ventas" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Producto
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {disponibles.map((p) => (
              <button
                key={p.producto.id}
                type="button"
                onClick={() => handleElegirProducto(p.producto.id)}
                aria-pressed={productoId === p.producto.id}
                className={`min-h-11 px-4 text-sm font-medium ${
                  productoId === p.producto.id
                    ? "bg-primary text-background"
                    : "border border-border text-text"
                }`}
              >
                {p.producto.nombre}
              </button>
            ))}
          </div>
        </div>

        {seleccionado && (
          <>
            <div>
              <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
                Cantidad (tenés {seleccionado.enPoder})
              </span>
              <div className="mt-1.5">
                <CantidadStepper value={cantidad} onChange={setCantidad} min={1} max={seleccionado.enPoder} />
              </div>
            </div>

            <div>
              <MontoInput
                id="precio-venta"
                label={`¿A cuánto la vendiste? (por ${envase(1)})`}
                value={precioVenta}
                onChange={setPrecioVenta}
                required
                placeholder="$ 0,00"
                simbolo={null}
                labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
                cajaClassName="mt-1 flex border-b-2 border-primary"
                inputClassName="font-display block w-full min-w-0 bg-transparent py-1 text-[34px] text-primary tabular-nums focus:outline-none"
              />
              {sugerido !== null && (
                <span className="mt-1 block text-[12px] text-text-muted">
                  Precio sugerido: {formatCentavos(sugerido)}
                </span>
              )}
            </div>

            {atribucion && (
              <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
                {costoTotal === null ? (
                  <p className="text-accent">
                    {NEGOCIO.nombre} todavía no te asignó precio para este producto.
                  </p>
                ) : (
                  <p className="text-text">
                    Le vas a deber a {NEGOCIO.nombre}{" "}
                    <span className="font-medium tabular-nums">{formatCentavos(costoTotal)}</span>{" "}
                    por esta venta.
                  </p>
                )}
                {atribucion.tramos.length > 0 && (
                  <p className="text-[11px] text-text-muted">
                    {atribucion.tramos
                      .map(
                        (t) =>
                          `${t.cantidad} de la entrega del ${formatFecha(t.fecha)}${
                            t.costoUnitarioCentavos !== null
                              ? ` (${formatCentavos(t.costoUnitarioCentavos)} c/u)`
                              : ""
                          }`,
                      )
                      .join(" · ")}
                  </p>
                )}
                {atribucion.entregaPosterior && (
                  <p className="text-accent">
                    La venta es del {formatFecha(fecha)} pero esas {envase(2)} te las entregaron el{" "}
                    {formatFecha(atribucion.entregaPosterior)}. Cambiá la fecha.
                  </p>
                )}
                {ganancia !== null && (
                  <p className="text-text">
                    Ganás <span className="font-medium tabular-nums">{formatCentavos(ganancia)}</span>{" "}
                    en esta venta.
                  </p>
                )}
                {bajoCosto && (
                  <p className="text-accent">
                    Ojo: a ese precio vendés por debajo de lo que le debés a {NEGOCIO.nombre} por{" "}
                    {envase(1)}. Si es así, podés guardarla igual.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <MedioPagoChips value={medioPago} onChange={setMedioPago} />

        <div>
          <label htmlFor="fecha" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Fecha
          </label>
          <input
            id="fecha"
            type="date"
            required
            max={hoyISO()}
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
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
            onChange={(event) => setNota(event.target.value)}
            rows={2}
            className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
          />
        </div>

        {error && (
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
          Guardar venta
        </BotonAccion>
      </form>

      <BottomSheet
        open={alerta !== null}
        ariaLabel={`No tenés ${concordar("tantos", "tantas")} ${NEGOCIO.envase.plural}`}
        variant="accent"
      >
        <h2 className="font-display text-[24px] text-primary">
          No tenés {concordar("tantos", "tantas")} {NEGOCIO.envase.plural}
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          No tenés {concordar("tantos", "tantas")} {NEGOCIO.envase.plural} de{" "}
          {alerta?.producto}. Tenés {alerta?.disponible}.
        </p>
        <button
          type="button"
          onClick={() => setAlerta(null)}
          className="mt-5 min-h-11 w-full bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase"
        >
          Entendido
        </button>
      </BottomSheet>
    </>
  );
}
