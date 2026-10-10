"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { InformarDepositoCoordinador } from "@/components/mi/informar-deposito-coordinador";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import {
  armarItemsEntregaCoordinador,
  ERRORES_ENTREGA_COORDINADOR,
  formatDisponiblePorPresentacion,
  totalDisponible,
  type RevendedoraCoordinador,
} from "@/lib/dominio/coordinador";
import { entregarComoCoordinador, listarLotesDisponiblesCoordinador } from "@/lib/coordinador";
import { hoyISO } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

type Producto = { id: string; nombre: string; presentacionMl: number | null };

type CoordinadorHomeProps = {
  /** Id del coordinador logueado: la carpeta de Storage de sus comprobantes. */
  vendedorId: string;
  nombre: string | null;
  revendedoras: RevendedoraCoordinador[];
  productos: Producto[];
  /** Lo que el coordinador logueado tiene que pasar a la cuenta de
   * Ananja (`v_plata_en_manos.total_centavos`, ya filtrada a su propia
   * fila por la RLS de la vista, 0057) — desde 0058, YA es solo la parte
   * Ananja de lo que le rindieron sus revendedoras, sin su margen. */
  plataEnManoCentavos: number;
};

/**
 * `/mi` de un coordinador (`0055_coordinador.sql`) — pedido de Fran: "en su
 * app ve SOLO las revendedoras a su cargo: cuántas botellas le entregó a
 * cada una y cuánto le deben, en pesos al costo Ananja". Sin nada de
 * Plata, Producción, Gastos ni Ganancia — la única acción es "Entregar"
 * (nunca carga ventas ni pagos).
 */
export function CoordinadorHome({
  vendedorId,
  nombre,
  revendedoras,
  productos,
  plataEnManoCentavos,
}: CoordinadorHomeProps) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 pb-8">
      <div>
        <h1 className="font-display text-[28px] leading-[1.1] text-primary md:text-[32px]">
          {nombre ? `Hola, ${nombre}` : "Tus revendedoras"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Cuánto le entregaste a cada una y cuánto te debe.
        </p>
      </div>

      {plataEnManoCentavos > 0 && (
        <div className="flex flex-col gap-2 border border-border bg-surface-raised p-4">
          <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
            Tenés que pasar a {NEGOCIO.nombre}
          </span>
          <p className="font-display text-[28px] leading-none text-primary tabular-nums">
            {formatCentavos(plataEnManoCentavos)}
          </p>
          <p className="text-[12px] text-text-muted">
            Pasala a la cuenta de {NEGOCIO.nombre} y avisanos.
          </p>
          <InformarDepositoCoordinador montoCentavos={plataEnManoCentavos} vendedorId={vendedorId} />
        </div>
      )}

      {revendedoras.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">
          Todavía no tenés ninguna revendedora asignada.
        </p>
      ) : (
        <div className="flex flex-col gap-px border border-border bg-border">
          {revendedoras.map((r) => (
            <RevendedoraCard key={r.id} revendedora={r} productos={productos} />
          ))}
        </div>
      )}
    </div>
  );
}

function RevendedoraCard({
  revendedora,
  productos,
}: {
  revendedora: RevendedoraCoordinador;
  productos: Producto[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex flex-col gap-3 bg-surface-raised p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words text-[16px] font-medium text-text">{revendedora.nombre}</span>
        <span className="shrink-0 font-display text-[20px] leading-none text-accent tabular-nums">
          {formatCentavos(revendedora.debeCentavos)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-text-muted uppercase tracking-[0.08em]">En su poder</span>
        <span className="tabular-nums text-text">
          {revendedora.enPoder} {envase(revendedora.enPoder)}
        </span>
      </div>
      {revendedora.valorEnPoderCentavos > 0 && (
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="text-text-muted uppercase tracking-[0.08em]">Valor en poder</span>
          <span className="tabular-nums text-text">{formatCentavos(revendedora.valorEnPoderCentavos)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 flex min-h-11 items-center justify-center border border-primary px-4 text-[12px] font-medium tracking-[0.14em] text-primary uppercase"
      >
        Entregar
      </button>

      {abierto && (
        <EntregarSheet
          revendedora={revendedora}
          productos={productos}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

function EntregarSheet({
  revendedora,
  productos,
  onClose,
}: {
  revendedora: RevendedoraCoordinador;
  productos: Producto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, 0])),
  );
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disponible por producto (0057, pedido de Fran: "sabiendo cuántas hay"
  // antes de entregar) — se pide una sola vez al abrir la hoja, para TODOS
  // los productos (no solo los que ya tienen cantidad cargada), así el
  // stepper nace con su tope puesto. `null` mientras carga: el stepper
  // arranca en 0 disponible (no deja sumar) hasta tener el dato real, para
  // no dejar tocar "+" con un tope viejo o inexistente.
  const [disponiblePorProducto, setDisponiblePorProducto] = useState<Record<string, number> | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargarDisponible() {
      const supabase = createClient();
      const entradas = await Promise.all(
        productos.map(async (p) => [p.id, await listarLotesDisponiblesCoordinador(supabase, p.id)] as const),
      );
      if (cancelado) return;
      const falla = entradas.find(([, r]) => r.error !== null);
      if (falla) {
        setStockError(falla[1].error);
        return;
      }
      setDisponiblePorProducto(Object.fromEntries(entradas.map(([id, r]) => [id, totalDisponible(r.data)])));
    }
    void cargarDisponible();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `productos` es estable (prop del padre, no cambia mientras la hoja está abierta).
  }, []);

  const totalUnidades = Object.values(cantidades).reduce((acc, c) => acc + c, 0);
  const nombrePorProducto = new Map(productos.map((p) => [p.id, p.nombre]));
  const textoDisponible =
    disponiblePorProducto &&
    formatDisponiblePorPresentacion(
      productos.map((p) => ({
        presentacionMl: p.presentacionMl,
        disponible: disponiblePorProducto[p.id] ?? 0,
      })),
    );

  async function handleGuardar() {
    setError(null);
    setSaving(true);
    const supabase = createClient();

    // Reparto por lote (0055, decisión de Fran: si un pedido no entra en
    // un solo lote, se divide entre varios — reusa `repartirCantidadEntreLotes`,
    // `lib/lotes-split.ts`, la misma función que ya usa un admin). Solo se
    // pide el stock por lote de los productos con cantidad > 0 — nunca se
    // lee ni se muestra un costo acá, `lotes_disponibles_coordinador` no
    // los expone.
    const productosConCantidad = productos.filter((p) => (cantidades[p.id] ?? 0) > 0);
    const lotesPorProductoEntries = await Promise.all(
      productosConCantidad.map(
        async (p) => [p.id, await listarLotesDisponiblesCoordinador(supabase, p.id)] as const,
      ),
    );

    // Si no se pudo CONSULTAR el stock de algún producto, no hay que decir
    // "no hay stock" (mentira, ni siquiera se pudo preguntar) — mensaje
    // aparte, mismo texto que devuelve `mapearLotesDisponibles`.
    const fallaConsulta = lotesPorProductoEntries.find(([, r]) => r.error !== null);
    if (fallaConsulta) {
      setError(fallaConsulta[1].error);
      setSaving(false);
      return;
    }

    const lotesPorProducto = Object.fromEntries(lotesPorProductoEntries.map(([id, r]) => [id, r.data]));

    const resultado = armarItemsEntregaCoordinador(cantidades, lotesPorProducto, nombrePorProducto);
    if (resultado.items === null) {
      setError(resultado.error);
      setSaving(false);
      return;
    }

    const { error: rpcError } = await entregarComoCoordinador(supabase, {
      vendedorId: revendedora.id,
      fecha,
      nota: nota.trim() || null,
      items: resultado.items,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES_ENTREGA_COORDINADOR, "No se pudo guardar. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open ariaLabel={`Entregar a ${revendedora.nombre}`}>
      <h2 className="font-display text-[24px] text-primary">Entregar a {revendedora.nombre}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Le cobramos el costo {NEGOCIO.nombre} vigente de cada {envase(1)} — no hace falta que lo cargues vos.
      </p>

      <p className="mt-3 text-[12px] text-text-muted">
        {stockError ? stockError : textoDisponible ? `Disponible: ${textoDisponible}` : "Consultando disponible…"}
      </p>

      <div className="mt-2 flex flex-col gap-1">
        {productos.map((producto) => {
          const disponible = disponiblePorProducto?.[producto.id] ?? 0;
          return (
            <div key={producto.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <span className="text-[14px] text-text">{producto.nombre}</span>
              <CantidadStepper
                value={cantidades[producto.id] ?? 0}
                onChange={(value) => setCantidades((prev) => ({ ...prev, [producto.id]: value }))}
                max={disponible}
                ariaLabelSufijo={` de ${producto.nombre}`}
                disableAtMin={false}
                size="sm"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <label htmlFor="fecha-entrega" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Fecha
        </label>
        <input
          id="fecha-entrega"
          type="date"
          required
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="nota-entrega" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Nota (opcional)
        </label>
        <textarea
          id="nota-entrega"
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={2}
          className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          disabled={totalUnidades === 0}
          onClick={() => void handleGuardar()}
          className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Confirmar entrega
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
