"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { listarLotesDisponiblesCoordinador, registrarVentaCoordinador } from "@/lib/coordinador";
import {
  avisoVentaCoordinadorAdmin,
  avisoVentaCoordinadoraPropia,
  cantidadValidaVentaCoordinador,
  leerResultadoVentaCoordinador,
  loteInicialVentaCoordinador,
  lotesParaVentaCoordinador,
  mensajeErrorVentaCoordinador,
  rotuloLoteVenta,
  textoVentaPropiaGuardada,
  type LoteVentaCoordinador,
} from "@/lib/dominio/venta-coordinador";
import { hoyISO } from "@/lib/fechas";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

type Producto = { id: string; nombre: string };

/** Lote con stock de un producto, como lo lee un admin (con costo). */
export type LoteDepositoAdmin = {
  loteId: string;
  productoId: string;
  fecha: string;
  quedan: number;
  costoAnanjaCentavos: number | null;
};

type VentaCoordinadorProps = {
  /** La coordinadora que vendió (en `/mi`, la propia persona logueada). */
  coordinadorId: string;
  coordinadorNombre: string;
  productos: Producto[];
  /** `admin`: carga un admin por ella (ve el costo y el monto antes de
   * guardar). `propia`: la propia coordinadora (no ve costos). */
  modo: "admin" | "propia";
  /** Solo `admin`: lotes con stock de todos los productos, con costo. */
  lotesAdmin?: LoteDepositoAdmin[];
  /** Texto del botón que abre la hoja ("Vendió ella" / "Vendí yo"). */
  etiqueta: string;
  className?: string;
};

const CAMPO = "mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary";
const ROTULO = "text-[10px] tracking-[0.18em] text-text-muted uppercase";

/**
 * Botón + hoja "La coordinadora vendió N botellas" (`registrar_venta_coordinador`,
 * supabase/migrations/0073_venta_directa_y_venta_coordinador.sql): producto,
 * lote (uno solo por carga), cantidad (tope = lo que queda del lote), fecha
 * y nota. Las botellas bajan del depósito y a ella le suma N × costo Ananja
 * a lo que tiene que pasar a Ananja; el precio al que las vendió no importa.
 *
 * Lo usa el admin en la ficha de la coordinadora (ve el costo del lote y el
 * monto antes de guardar) y la propia coordinadora en `/mi` (no ve costos:
 * los lotes salen de `lotes_disponibles_coordinador`; el monto se le muestra
 * DESPUÉS de guardar, con lo que responde el servidor).
 *
 * El RPC no es idempotente: el envío se protege con `BotonAccion` (deshabilita
 * mientras guarda) y con una traba síncrona (`enviando`) por si dos toques
 * llegan antes de que React pinte el estado.
 */
export function VentaCoordinador({
  coordinadorId,
  coordinadorNombre,
  productos,
  modo,
  lotesAdmin = [],
  etiqueta,
  className,
}: VentaCoordinadorProps) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={
          className ??
          "flex min-h-11 items-center justify-center border border-primary px-4 text-[12px] font-medium tracking-[0.14em] text-primary uppercase"
        }
      >
        {etiqueta}
      </button>
      {abierto && (
        <VentaCoordinadorSheet
          coordinadorId={coordinadorId}
          coordinadorNombre={coordinadorNombre}
          productos={productos}
          modo={modo}
          lotesAdmin={lotesAdmin}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function VentaCoordinadorSheet({
  coordinadorId,
  coordinadorNombre,
  productos,
  modo,
  lotesAdmin,
  onClose,
}: Omit<VentaCoordinadorProps, "etiqueta" | "className"> & { lotesAdmin: LoteDepositoAdmin[]; onClose: () => void }) {
  const router = useRouter();
  const esAdmin = modo === "admin";

  // Lotes elegibles por producto. Admin: ya vienen del server. Propia: se
  // piden al abrir (RPC sin costos); `null` mientras carga.
  const [lotesPropia, setLotesPropia] = useState<Record<string, LoteVentaCoordinador[]> | null>(null);
  const [errorLotes, setErrorLotes] = useState<string | null>(null);

  useEffect(() => {
    if (esAdmin) return;
    let cancelado = false;
    async function cargar() {
      const supabase = createClient();
      const entradas = await Promise.all(
        productos.map(async (p) => [p.id, await listarLotesDisponiblesCoordinador(supabase, p.id)] as const),
      );
      if (cancelado) return;
      const falla = entradas.find(([, r]) => r.error !== null);
      if (falla) {
        setErrorLotes(falla[1].error);
        return;
      }
      const porProducto = Object.fromEntries(
        entradas.map(([id, r]) => [
          id,
          lotesParaVentaCoordinador(
            r.data.map((l) => ({ loteId: l.loteId, fecha: l.fecha, quedan: l.quedan })),
            false,
          ),
        ]),
      );
      setLotesPropia(porProducto);
      // Si el producto con el que arrancó no tiene stock, pasa al primero que sí.
      setProductoId((actual) =>
        (porProducto[actual]?.length ?? 0) > 0
          ? actual
          : (productos.find((p) => (porProducto[p.id]?.length ?? 0) > 0)?.id ?? actual),
      );
    }
    void cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `productos` es estable mientras la hoja está abierta.
  }, []);

  function lotesDe(productoId: string): LoteVentaCoordinador[] {
    if (esAdmin) {
      return lotesParaVentaCoordinador(
        lotesAdmin
          .filter((l) => l.productoId === productoId)
          .map((l) => ({
            loteId: l.loteId,
            fecha: l.fecha,
            quedan: l.quedan,
            costoAnanjaCentavos: l.costoAnanjaCentavos,
          })),
        true,
      );
    }
    return lotesPropia?.[productoId] ?? [];
  }

  const listo = esAdmin || lotesPropia !== null;
  // Admin: los lotes ya están al montar, así que arranca en el primer producto
  // con stock. Propia: arranca en el primero y se corrige al llegar los lotes.
  const [productoId, setProductoId] = useState<string>(
    () => (esAdmin ? productos.find((p) => lotesDe(p.id).length > 0)?.id : undefined) ?? productos[0]?.id ?? "",
  );
  const [loteElegido, setLoteElegido] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const enviando = useRef(false);
  // Id de la venta: se genera una vez al abrir la hoja y se renueva si cambia
  // cualquier dato del formulario. Un reintento tras un error de red reusa el
  // mismo, así un doble envío no crea dos ventas (el servidor devuelve la ya
  // guardada).
  const [grupoId, setGrupoId] = useState(() => crypto.randomUUID());
  const renovarGrupo = () => setGrupoId(crypto.randomUUID());

  const lotes = lotesDe(productoId);
  // Si no eligió ninguno (o el elegido ya no existe), el más viejo con stock.
  const lote = lotes.find((l) => l.loteId === loteElegido) ?? loteInicialVentaCoordinador(lotes);
  const cantidadEfectiva = lote ? Math.min(Math.max(cantidad, 1), lote.quedan) : cantidad;
  const valida = cantidadValidaVentaCoordinador(cantidadEfectiva, lote);
  const costo = lote?.costoAnanjaCentavos ?? null;

  function elegirProducto(id: string) {
    setProductoId(id);
    setLoteElegido(null);
    setCantidad(1);
    setError(null);
    renovarGrupo();
  }

  function elegirLote(id: string) {
    setLoteElegido(id);
    setError(null);
    renovarGrupo();
  }

  async function guardar() {
    if (enviando.current || !lote || !valida) return;
    enviando.current = true;
    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error: rpcError } = await registrarVentaCoordinador(supabase, {
      coordinadorId,
      productoId,
      cantidad: cantidadEfectiva,
      loteId: lote.loteId,
      fecha,
      nota: nota.trim() || null,
      grupoId,
    });

    if (rpcError) {
      setError(mensajeErrorVentaCoordinador(rpcError.message, (rpcError as { details?: string }).details));
      setSaving(false);
      enviando.current = false;
      return;
    }

    setSaving(false);
    if (esAdmin) {
      onClose();
      router.refresh();
      return;
    }
    // Ella no ve costos: se le dice cuánto se sumó con lo que responde el servidor.
    setGuardado(textoVentaPropiaGuardada(leerResultadoVentaCoordinador(data).montoCentavos));
    router.refresh();
  }

  const titulo = esAdmin ? `${coordinadorNombre} vendió botellas` : "Vendí botellas";

  if (guardado !== null) {
    return (
      <BottomSheet open ariaLabel="Venta guardada">
        <h2 className="font-display text-[24px] text-primary">Venta guardada</h2>
        <p className="mt-2 text-sm text-text">{guardado}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-11 w-full bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase"
        >
          Listo
        </button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open ariaLabel={titulo}>
      <h2 className="font-display text-[24px] text-primary">{titulo}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Las botellas salen del depósito y se suman a lo que {esAdmin ? `${coordinadorNombre} tiene` : "tenés"} que
        pasar a {NEGOCIO.nombre}. El precio al que las {esAdmin ? "vendió" : "vendiste"} no hace falta.
      </p>

      {errorLotes ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {errorLotes}
        </p>
      ) : !listo ? (
        <p className="mt-3 text-sm text-text-muted">Consultando disponible…</p>
      ) : (
        <>
          <div className="mt-4">
            <span className={ROTULO}>Producto</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {productos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegirProducto(p.id)}
                  aria-pressed={productoId === p.id}
                  className={`min-h-11 px-4 text-sm font-medium ${
                    productoId === p.id ? "bg-primary text-background" : "border border-border text-text"
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>

          {lotes.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">
              No hay botellas de este producto en el depósito{esAdmin ? " (o sus lotes todavía no tienen costos cargados)" : ""}.
            </p>
          ) : (
            <>
              <div className="mt-4">
                <label htmlFor="lote-venta-coordinador" className={ROTULO}>
                  Lote
                </label>
                {lotes.length === 1 ? (
                  <p className="mt-1.5 text-sm text-text">{rotuloLoteVenta(lotes[0])}</p>
                ) : (
                  <select
                    id="lote-venta-coordinador"
                    value={lote?.loteId ?? ""}
                    onChange={(event) => elegirLote(event.target.value)}
                    className={CAMPO}
                  >
                    {lotes.map((l) => (
                      <option key={l.loteId} value={l.loteId}>
                        {rotuloLoteVenta(l)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-4">
                <span className={ROTULO}>Cantidad (quedan {lote?.quedan ?? 0} en el lote)</span>
                <div className="mt-1.5">
                  <CantidadStepper
                    value={cantidadEfectiva}
                    onChange={(v) => {
                      setCantidad(v);
                      setError(null);
                      renovarGrupo();
                    }}
                    min={1}
                    max={lote?.quedan}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="fecha-venta-coordinador" className={ROTULO}>
                  Fecha
                </label>
                <input
                  id="fecha-venta-coordinador"
                  type="date"
                  required
                  max={hoyISO()}
                  value={fecha}
                  onChange={(event) => {
                    setFecha(event.target.value);
                    renovarGrupo();
                  }}
                  className={CAMPO}
                />
              </div>

              <div className="mt-4">
                <label htmlFor="nota-venta-coordinador" className={ROTULO}>
                  Nota (opcional)
                </label>
                <textarea
                  id="nota-venta-coordinador"
                  value={nota}
                  onChange={(event) => {
                    setNota(event.target.value);
                    renovarGrupo();
                  }}
                  rows={2}
                  className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
                />
              </div>

              {valida && (
                <p className="mt-4 border-y border-border py-3 text-sm text-text">
                  {esAdmin && costo !== null
                    ? avisoVentaCoordinadorAdmin({
                        cantidad: cantidadEfectiva,
                        coordinadorNombre,
                        costoAnanjaCentavos: costo,
                      })
                    : avisoVentaCoordinadoraPropia(cantidadEfectiva)}
                </p>
              )}
            </>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          disabled={!listo || !valida || fecha === ""}
          onClick={() => void guardar()}
          className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Confirmar
        </BotonAccion>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
        >
          Cancelar
        </button>
      </div>
    </BottomSheet>
  );
}
