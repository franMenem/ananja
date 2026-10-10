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
import { atribuirVenta, type TramoStock } from "@/lib/dominio/revendedor-stock";
import {
  cantidadDeVentaValida,
  leerDetalleError,
  mensajeErrorVentaPropia,
  resumirVentaPropia,
  topeCantidadVenta,
} from "@/lib/dominio/venta-directa";
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
 * igual" — acá no hay bypass.
 *
 * `tomaDirecto` ("agarra directo del depósito", 0073): salen todos los
 * productos aunque tenga 0 en poder, la cantidad no tiene tope y no hay
 * error de "Revisá la cantidad" por stock — lo que no tenga entregado lo
 * saca el servidor del depósito y queda anotado como entrega automática.
 * Ella no puede ver el stock ni los costos del depósito, así que para esa
 * parte no se muestra costo ni ganancia (`resumirVentaPropia`); si el
 * depósito tampoco alcanza, el servidor responde `DEPOSITO_INSUFICIENTE`.
 * Sin el flag, todo queda como siempre.
 */
export function VentaForm({
  productos,
  tomaDirecto = false,
}: {
  productos: ProductoDisponible[];
  tomaDirecto?: boolean;
}) {
  const router = useRouter();
  const disponibles = tomaDirecto ? productos : productos.filter((p) => p.enPoder > 0);

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
  const resumen = atribucion ? resumirVentaPropia(atribucion, precioVentaCentavos, tomaDirecto) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!seleccionado) {
      setError("Elegí un producto.");
      return;
    }
    if (!cantidadDeVentaValida(cantidad, seleccionado.enPoder, tomaDirecto)) {
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
      const detalleCrudo = (rpcError as { details?: string }).details;
      if (rpcError.message === "STOCK_REVENDEDOR_INSUFICIENTE") {
        // sin detalle parseable, se muestra el mensaje genérico igual
        const detalle = leerDetalleError(detalleCrudo);
        setAlerta({
          producto: typeof detalle.producto === "string" ? detalle.producto : "un producto",
          disponible: typeof detalle.disponible === "number" ? detalle.disponible : 0,
        });
        setSaving(false);
        return;
      }
      setError(mensajeErrorVentaPropia(rpcError.message, detalleCrudo));
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
                <CantidadStepper
                  value={cantidad}
                  onChange={setCantidad}
                  min={1}
                  max={topeCantidadVenta(seleccionado.enPoder, tomaDirecto)}
                />
              </div>
              {tomaDirecto && (
                <p className="mt-1.5 text-[12px] text-text-muted">
                  Lo que no tengas entregado se anota como agarrado del depósito.
                </p>
              )}
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

            {atribucion && resumen && (
              <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
                {resumen.delDeposito > 0 && (
                  <p className="text-text">
                    {resumen.delDeposito} {envase(resumen.delDeposito)} se anotan como agarradas del
                    depósito.
                  </p>
                )}
                {resumen.sinPrecioAsignado ? (
                  <p className="text-accent">
                    {NEGOCIO.nombre} todavía no te asignó precio para este producto.
                  </p>
                ) : resumen.delDeposito > 0 ? (
                  <>
                    {resumen.costoPropioCentavos !== null && (
                      <p className="text-text">
                        Por las {resumen.propias} que ya tenías entregadas le vas a deber a{" "}
                        {NEGOCIO.nombre}{" "}
                        <span className="font-medium tabular-nums">
                          {formatCentavos(resumen.costoPropioCentavos)}
                        </span>
                        .
                      </p>
                    )}
                    <p className="text-[11px] text-text-muted">
                      Lo de las {resumen.delDeposito} del depósito lo calcula {NEGOCIO.nombre} al
                      guardar: todavía no podemos mostrarte ese costo ni cuánto ganás en total.
                    </p>
                  </>
                ) : resumen.costoTotalCentavos !== null ? (
                  <p className="text-text">
                    Le vas a deber a {NEGOCIO.nombre}{" "}
                    <span className="font-medium tabular-nums">
                      {formatCentavos(resumen.costoTotalCentavos)}
                    </span>{" "}
                    por esta venta.
                  </p>
                ) : null}
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
                {resumen.gananciaCentavos !== null && (
                  <p className="text-text">
                    Ganás{" "}
                    <span className="font-medium tabular-nums">
                      {formatCentavos(resumen.gananciaCentavos)}
                    </span>{" "}
                    en esta venta.
                  </p>
                )}
                {resumen.bajoCosto && (
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
