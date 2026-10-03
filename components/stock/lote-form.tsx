"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { SetFormHeader } from "@/components/page-header-context";
import {
  CostosLoteCampos,
  type AceiteHeredado,
  type EtiquetaInsumoLote,
  type TanqueAceiteHint,
  type UltimasComprasEtiquetas,
} from "@/components/stock/costos-lote-campos";
import { RevisionPedido } from "@/components/stock/revision-pedido";
import { calcularConsumoLote } from "@/lib/dominio/calculos";
import type { PorcentajesLote, RecetaEtiquetaConInsumo } from "@/lib/dominio/costos-lote";
import { listarInsumosActivos, listarRecetas, type Insumo, type Receta } from "@/lib/data/insumos";
import { hoyISO } from "@/lib/fechas";
import { formatCantidadConUnidad } from "@/lib/dominio/insumos";
import {
  camposCostosLoteInvalidos,
  construirEntradaPedido,
  construirPCostosLote,
  mensajeCamposInvalidos,
  mensajeErrorLote,
  prefillCostosLote,
  type CostosLoteState,
  type LoteCostoRow,
  type RedondeoCosto,
} from "@/lib/dominio/lotes";
import { crearLote } from "@/lib/lotes";
import { createClient } from "@/lib/supabase/client";
import { useVendedorActual } from "@/lib/vendedor-actual";
import type { Tables } from "@/lib/types";

type Producto = Pick<Tables<"productos">, "id" | "nombre" | "presentacion_ml">;

type LoteFormProps = {
  productos: Producto[];
  /** Costos del último lote con costos cargados, para prefijar "Costos del
   * pedido" (README ítem 1 del build de Producción) — `[]` si ningún lote
   * tiene costos todavía. */
  ultimoLoteCostos?: LoteCostoRow[];
  /** % de ganancia/mayorista/minorista del lote de producción MÁS
   * RECIENTE (tenga costos o no) — mismo criterio que `crear_lote` cuando
   * no se le manda ningún % — para prefijar "Precios" en "Costos del
   * pedido". `null` sin ningún lote todavía (el primero de la app), quedan
   * en el default 30/15/40 (`costosLoteStateVacio`). */
  ultimoLotePcts?: PorcentajesLote | null;
  /** % de transporte / IVA vigentes del lote más reciente — mismo criterio
   * que `ultimoLotePcts`. */
  ultimoLoteTransportePct?: number | null;
  ultimoLoteIvaPct?: number | null;
  ultimoLotePrecioIncluyeIva?: boolean | null;
  /** "el proveedor cobró el envasado sin IVA" del lote más reciente (0038). */
  ultimoLoteEnvaseCobradoSinIva?: boolean | null;
  /** Dólar (ARS por USD) y precio del litro de aceite en USD del lote de
   * producción MÁS RECIENTE que los tenga cargados (0030) — mismo criterio
   * de herencia que `crear_lote` cuando `p_costos` no los manda, para
   * prefijar "Aceite" en "Costos del pedido". `null` sin ningún lote
   * todavía con dólar cargado. */
  ultimoLoteDolarCentavos?: number | null;
  ultimoLotePrecioLitroAceiteUsdCentavos?: number | null;
  /** Fecha (YYYY-MM-DD) del lote del que salen `ultimoLoteDolarCentavos`/
   * `ultimoLotePrecioLitroAceiteUsdCentavos` — para el aviso "¿lo
   * actualizás?" mientras el dueño no toque esos campos (ver
   * `AceiteHeredado`, riesgo real: `crear_lote` los hereda EN SILENCIO si
   * no se los manda, un pedido de un mes después puede terminar costeando
   * con un dólar vencido sin que nadie lo note). */
  ultimoLoteFecha?: string | null;
  /** Promedio ponderado vigente de `v_tanque_aceite`, para prefijar
   * "Precio por litro" y su hint — `null` sin ninguna compra cargada. */
  tanqueAceite?: TanqueAceiteHint;
  /** Última compra de cada insumo de etiqueta (`obtenerUltimasComprasInsumos`,
   * lib/insumos.ts) — fallback de precio cuando `ultimoLoteCostos` no trae
   * ese insumo (build "insumos en cero"), y fuente del hint
   * "Precio de la última compra — 12/09" en `CostosLoteCampos`. */
  ultimasComprasEtiquetas?: UltimasComprasEtiquetas;
};

type InsumoAlert = {
  insumo: string;
  insumoId: string;
  disponible: number;
};

/**
 * "Nuevo pedido al proveedor":
 * alta de un lote de producción con varias presentaciones a la vez (un
 * stepper por producto — en Ananja, 500 ml y 250 ml), fecha, nota y,
 * opcionalmente, los costos reales del pedido ("Costos del pedido":
 * precio por litro de aceite, por etiqueta, por envase de cada
 * presentación, transporte y otros — ver `CostosLoteCampos`). Todo lo de
 * costos es opcional: el lote se puede guardar sin ellos y completarlos
 * después desde `/stock/lotes/[id]/costos`. Al confirmar llama a
 * `crear_lote` con `p_items` = solo los productos con cantidad > 0 y
 * `p_costos` = lo cargado en "Costos del pedido" (`construirPCostosLote`,
 * `null` si no se cargó nada) — ver
 * `supabase/migrations/0028_costos_por_lote.sql`.
 *
 * Desde la tanda de insumos: antes de guardar muestra un resumen de cuánto va a descontar de
 * cada insumo según receta (`calcularConsumoLote`, mismo espejo que usa
 * `crear_lote` — supabase/migrations/0017_insumos.sql), recalculado en
 * cada cambio de cantidad. Si el RPC falla con `INSUMO_INSUFICIENTE`
 * (algún insumo quedaría negativo), se ofrece "Guardar igual" en un
 * `BottomSheet` — mismo flujo que `STOCK_INSUFICIENTE` en
 * `components/comprobante-form.tsx`.
 */
export function LoteForm({
  productos,
  ultimoLoteCostos = [],
  ultimoLotePcts = null,
  ultimoLoteTransportePct = null,
  ultimoLoteIvaPct = null,
  ultimoLotePrecioIncluyeIva = null,
  ultimoLoteEnvaseCobradoSinIva = null,
  ultimoLoteDolarCentavos = null,
  ultimoLotePrecioLitroAceiteUsdCentavos = null,
  ultimoLoteFecha = null,
  tanqueAceite = null,
  ultimasComprasEtiquetas = null,
}: LoteFormProps) {
  const router = useRouter();
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, 0])),
  );
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [insumoAlert, setInsumoAlert] = useState<InsumoAlert | null>(null);
  const [costos, setCostos] = useState<CostosLoteState>(() =>
    prefillCostosLote(
      ultimoLoteCostos,
      productos.map((p) => p.id),
      {
        pcts: ultimoLotePcts,
        transportePct: ultimoLoteTransportePct,
        ivaPct: ultimoLoteIvaPct,
        precioIncluyeIva: ultimoLotePrecioIncluyeIva,
        envaseCobradoSinIva: ultimoLoteEnvaseCobradoSinIva,
        tanquePrecioLitroAceiteCentavos: tanqueAceite?.costoPromedioCentavosPorLitro ?? null,
        dolarCentavos: ultimoLoteDolarCentavos,
        precioLitroAceiteUsdCentavos: ultimoLotePrecioLitroAceiteUsdCentavos,
        ultimasComprasEtiquetas,
      },
    ),
  );
  const permitirNegativoRef = useRef(false);
  // Montos reales confirmados en "Revisá el pedido" — se reusan al
  // "Guardar igual" (INSUMO_INSUFICIENTE) y al reintentar.
  const redondeosRef = useRef<RedondeoCosto[]>([]);
  const [revisando, setRevisando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([listarRecetas(supabase), listarInsumosActivos(supabase)]).then(
      ([recetasResult, insumosResult]) => {
        if (cancelled) return;
        setRecetas(recetasResult.data);
        setInsumos(insumosResult.data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const hayAlMenosUno = Object.values(cantidades).some((c) => c > 0);

  // Presentaciones con cantidad > 0 — las únicas que piden envase propio en
  // "Costos del pedido" y las que entran en la vista previa de costo/precio.
  const productosConCantidad = useMemo(
    () =>
      productos
        .filter((p) => (cantidades[p.id] ?? 0) > 0)
        .map((p) => ({
          productoId: p.id,
          nombre: p.nombre,
          presentacionMl: p.presentacion_ml,
          cantidad: cantidades[p.id],
        })),
    [productos, cantidades],
  );

  // Dólar/USD del pedido anterior — para el aviso "¿lo actualizás?" de
  // CostosLoteCampos mientras el dueño no toque esos campos (ver
  // AceiteHeredado). `null` sin ningún pedido anterior con dólar cargado.
  const aceiteHeredado: AceiteHeredado = useMemo(() => {
    if (!ultimoLoteFecha) return null;
    if (ultimoLoteDolarCentavos == null && ultimoLotePrecioLitroAceiteUsdCentavos == null) {
      return null;
    }
    return {
      fecha: ultimoLoteFecha,
      dolarCentavos: ultimoLoteDolarCentavos,
      usdCentavos: ultimoLotePrecioLitroAceiteUsdCentavos,
    };
  }, [ultimoLoteFecha, ultimoLoteDolarCentavos, ultimoLotePrecioLitroAceiteUsdCentavos]);

  // Recetas de insumo tipo 'etiqueta' (producto, insumo, cantidad por
  // botella) — lo que necesita `CostosLoteCampos` para calcular el costo de
  // etiqueta de cada presentación (frente y retro son insumos DISTINTOS,
  // ver supabase/migrations/0017_insumos.sql § seed).
  const recetasEtiqueta: RecetaEtiquetaConInsumo[] = useMemo(
    () =>
      recetas
        .filter((r) => insumos.find((i) => i.id === r.insumo_id)?.tipo === "etiqueta")
        .map((r) => ({ productoId: r.producto_id, insumoId: r.insumo_id, cantidad: r.cantidad })),
    [recetas, insumos],
  );

  // Insumos de etiqueta distintos usados por las presentaciones con
  // cantidad > 0 — una fila de precio + envío por cada uno en pantalla.
  const etiquetaInsumos: EtiquetaInsumoLote[] = useMemo(() => {
    const idsUsados = new Set(productosConCantidad.map((p) => p.productoId));
    const vistos = new Set<string>();
    const resultado: EtiquetaInsumoLote[] = [];
    for (const r of recetasEtiqueta) {
      if (!idsUsados.has(r.productoId) || vistos.has(r.insumoId)) continue;
      const insumo = insumos.find((i) => i.id === r.insumoId);
      if (!insumo) continue;
      vistos.add(r.insumoId);
      resultado.push({ insumoId: insumo.id, nombre: insumo.nombre });
    }
    return resultado;
  }, [recetasEtiqueta, insumos, productosConCantidad]);

  // Resumen de consumo en vivo — recalculado en cada cambio de cantidad,
  // sin ningún request adicional (calcularConsumoLote es puro TS).
  const consumo = useMemo(() => {
    if (recetas.length === 0) return [];
    const items = productos
      .filter((p) => (cantidades[p.id] ?? 0) > 0)
      .map((p) => ({ producto_id: p.id, cantidad: cantidades[p.id] }));
    return calcularConsumoLote(
      items,
      recetas.map((r) => ({
        producto_id: r.producto_id,
        insumo_id: r.insumo_id,
        cantidad: r.cantidad,
      })),
    );
  }, [cantidades, productos, recetas]);

  // Misma entrada que la vista previa en vivo — la usa "Revisá el pedido".
  const entradaPedido = useMemo(
    () =>
      construirEntradaPedido({
        state: costos,
        items: productosConCantidad,
        recetasEtiqueta,
        etiquetaInsumoIds: etiquetaInsumos.map((e) => e.insumoId),
        precioLitroTanqueCentavos: tanqueAceite?.costoPromedioCentavosPorLitro ?? null,
      }),
    [costos, productosConCantidad, recetasEtiqueta, etiquetaInsumos, tanqueAceite],
  );

  async function guardarLote(permitirNegativo: boolean) {
    permitirNegativoRef.current = permitirNegativo;
    setError(null);
    setSaving(true);

    try {
      const supabase = createClient();
      const items = productos
        .filter((p) => (cantidades[p.id] ?? 0) > 0)
        .map((p) => ({ producto_id: p.id, cantidad: cantidades[p.id] }));
      const pCostos = construirPCostosLote(
        costos,
        items.map((i) => i.producto_id),
        etiquetaInsumos.map((e) => e.insumoId),
        redondeosRef.current,
      );

      const { data: rpcData, error: rpcError } = await crearLote(supabase, {
        fecha,
        nota: nota.trim() || null,
        items,
        permitirNegativo,
        costos: pCostos,
      });

      if (rpcError) {
        if (rpcError.message === "INSUMO_INSUFICIENTE") {
          try {
            const detail = JSON.parse(rpcError.details ?? "{}") as {
              insumo?: string;
              insumo_id?: string;
              disponible?: number;
            };
            setInsumoAlert({
              insumo: detail.insumo ?? "un insumo",
              insumoId: detail.insumo_id ?? "",
              disponible: detail.disponible ?? 0,
            });
          } catch {
            setInsumoAlert({ insumo: "un insumo", insumoId: "", disponible: 0 });
          }
          return;
        }
        setError(mensajeErrorLote(rpcError.message, rpcError.details));
        return;
      }

      // Al detalle del lote recién creado (no a /stock) para que el dueño
      // vea de una el costo de la botella si cargó "Costos del pedido", o
      // el aviso "Completar costos de este pedido" si no.
      const loteId = (rpcData as { lote_id?: string } | null)?.lote_id;
      router.push(loteId ? `/stock/lotes/${loteId}` : "/stock");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisá la conexión e intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!hayAlMenosUno) {
      setError("Cargá al menos una cantidad.");
      return;
    }
    if (!fecha) {
      setError("Ingresá la fecha del lote.");
      return;
    }

    // Algo escrito que no se entiende ("1520*") no se guarda como "no
    // cargado": crear_lote heredaría el dólar/los % del pedido anterior.
    const invalidos = camposCostosLoteInvalidos(
      costos,
      productosConCantidad.map((p) => p.productoId),
      etiquetaInsumos.map((e) => e.insumoId),
    );
    if (invalidos.length > 0) {
      setError(mensajeCamposInvalidos(invalidos));
      return;
    }

    // Con costos cargados, antes de guardar se pasa por "Revisá el pedido"
    // (0038); sin costos no hay nada que revisar.
    redondeosRef.current = [];
    const hayCostos =
      construirPCostosLote(
        costos,
        productosConCantidad.map((p) => p.productoId),
        etiquetaInsumos.map((e) => e.insumoId),
      ) !== null;
    if (hayCostos) {
      setRevisando(true);
      window.scrollTo({ top: 0 });
      return;
    }

    await guardarLote(false);
  }

  const showRetry = error !== null && error.startsWith("No se pudo conectar");

  return (
    <div className="flex flex-col gap-5 pb-8">
      <SetFormHeader
        title="Nuevo lote de producción"
        backHref="/stock"
        backLabel="Volver a stock"
      />
      <FormHeaderDesktop />

      {revisando && (
        <RevisionPedido
          entrada={entradaPedido}
          etiquetaNombres={Object.fromEntries(etiquetaInsumos.map((e) => [e.insumoId, e.nombre]))}
          otrosDescripcion={costos.otrosDescripcion}
          saving={saving}
          error={error}
          onVolver={() => {
            setError(null);
            setRevisando(false);
          }}
          onConfirmar={(redondeos) => {
            redondeosRef.current = redondeos;
            void guardarLote(false);
          }}
        />
      )}

      <form onSubmit={handleSubmit} hidden={revisando} className="flex flex-col gap-5">
        <div>
          <label
            htmlFor="fecha"
            className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          >
            Fecha del lote
          </label>
          <input
            id="fecha"
            type="date"
            required
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
            Cantidades por presentación
          </span>
          {productos.map((producto) => (
            <div
              key={producto.id}
              className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-3"
            >
              <span className="min-w-0 truncate text-[14px] text-text">
                {producto.nombre}
              </span>
              <div className="shrink-0">
                <CantidadStepper
                  value={cantidades[producto.id] ?? 0}
                  onChange={(value) =>
                    setCantidades((prev) => ({ ...prev, [producto.id]: value }))
                  }
                  ariaLabelSufijo={` de ${producto.nombre}`}
                  disableAtMin={false}
                />
              </div>
            </div>
          ))}
          <p className="pt-2 text-[11px] leading-[1.5] text-text-muted">
            Se puede cargar el costo del pedido acá abajo, o completarlo
            después desde el detalle del lote.
          </p>
          {consumo.length > 0 && (
            <p className="pt-1 text-[11px] leading-[1.5] text-text">
              Va a descontar:{" "}
              {consumo
                .map((c) => {
                  const insumo = insumos.find((i) => i.id === c.insumo_id);
                  return insumo
                    ? `${formatCantidadConUnidad(c.cantidad, insumo.unidad)} de ${insumo.nombre.toLowerCase()}`
                    : formatCantidadConUnidad(c.cantidad, "unidad");
                })
                .join(", ")}
              .
            </p>
          )}
        </div>

        {productosConCantidad.length > 0 && (
          <CostosLoteCampos
            items={productosConCantidad}
            recetasEtiqueta={recetasEtiqueta}
            etiquetas={etiquetaInsumos}
            value={costos}
            onChange={setCostos}
            tanqueAceite={tanqueAceite}
            aceiteHeredado={aceiteHeredado}
            ultimasComprasEtiquetas={ultimasComprasEtiquetas}
          />
        )}

        {!vendedorLoading && vendedor && (
          <p className="text-xs text-text-muted">
            Registrando como{" "}
            <span className="font-medium">{vendedor.nombre}</span>
          </p>
        )}
        {!vendedorLoading && !vendedor && (
          <p role="alert" className="text-xs text-accent">
            Tu usuario no está vinculado a un vendedor. Pedile al dueño que
            te dé de alta desde el dashboard de Supabase.
          </p>
        )}

        <div>
          <label
            htmlFor="nota"
            className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          >
            Nota (opcional)
          </label>
          <input
            id="nota"
            type="text"
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            placeholder="Ej. producción semana 35"
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
        </div>

        {error && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-[12px] text-accent">
              {error}
            </p>
            {showRetry && (
              <button
                type="button"
                onClick={() => void guardarLote(permitirNegativoRef.current)}
                className="min-h-11 self-start border border-accent px-4 text-xs font-medium tracking-[0.1em] text-accent uppercase"
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          type="submit"
          className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Guardar
        </BotonAccion>
      </form>

      <BottomSheet
        open={insumoAlert !== null}
        ariaLabel="Insumo insuficiente"
        variant="accent"
      >
        {insumoAlert && (() => {
          const consumoInsumo =
            consumo.find((c) => c.insumo_id === insumoAlert.insumoId)
              ?.cantidad ?? 0;
          const unidad =
            insumos.find((i) => i.id === insumoAlert.insumoId)?.unidad ??
            "unidad";
          const resultante = insumoAlert.disponible - consumoInsumo;
          return (
            <>
              <span className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
                Insumo insuficiente
              </span>
              <p className="mt-3 font-display text-[20px] leading-[1.3] text-primary">
                Hay {formatCantidadConUnidad(insumoAlert.disponible, unidad)}{" "}
                de {insumoAlert.insumo}. Este lote necesita{" "}
                {formatCantidadConUnidad(consumoInsumo, unidad)}. Si guardás
                igual, queda en{" "}
                <span className={resultante < 0 ? "text-accent" : undefined}>
                  {formatCantidadConUnidad(resultante, unidad)}
                </span>
                .
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setInsumoAlert(null);
                    setRevisando(false);
                  }}
                  className="min-h-11 flex-1 border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase disabled:opacity-45"
                >
                  Revisar cantidades
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInsumoAlert(null);
                    void guardarLote(true);
                  }}
                  className="min-h-11 flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase"
                >
                  Guardar igual
                </button>
              </div>
            </>
          );
        })()}
      </BottomSheet>
    </div>
  );
}
