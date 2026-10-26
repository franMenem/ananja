"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Fila } from "@/components/ui/fila";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { VentaCoordinador } from "@/components/coordinador/venta-coordinador";
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
 * Plata, Producción, Gastos ni Ganancia — las acciones son "Entregar" (a
 * cada revendedora) y "Vendí yo" (0073: botellas que agarró del depósito y
 * vendió ella misma; se suman a lo que tiene que pasar a Ananja). Nunca
 * carga ventas de otras personas ni pagos.
 */
export function CoordinadorHome({
  vendedorId,
  nombre,
  revendedoras,
  productos,
  plataEnManoCentavos,
}: CoordinadorHomeProps) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 pb-8">
      <EncabezadoPantalla
        titulo={nombre ? `Hola, ${nombre}` : "Tus revendedoras"}
        pregunta="Cuánto le entregaste a cada una y cuánto te debe."
      />

      {plataEnManoCentavos > 0 && (
        <Tarjeta como="section" className="flex flex-col gap-3">
          <NumeroGrande etiqueta={`Tenés que pasarle a ${NEGOCIO.nombre}`}>
            {formatCentavos(plataEnManoCentavos)}
          </NumeroGrande>
          <Pastilla variante="aviso" className="w-fit">
            Todavía no la pasaste
          </Pastilla>
          <p className="text-[14px] text-text-muted">
            Pasala a la cuenta de {NEGOCIO.nombre} y avisanos.
          </p>
          <InformarDepositoCoordinador montoCentavos={plataEnManoCentavos} vendedorId={vendedorId} />
        </Tarjeta>
      )}

      <Tarjeta como="section" className="flex flex-col gap-2">
        <h2 className="font-display text-[20px] leading-tight font-bold text-text">Vendí yo</h2>
        <p className="text-[14px] text-text-muted">
          Si agarraste botellas del depósito y las vendiste vos, anotalas acá. Se suman a lo que tenés que pasar a{" "}
          {NEGOCIO.nombre}.
        </p>
        <VentaCoordinador
          coordinadorId={vendedorId}
          coordinadorNombre={nombre ?? "Vos"}
          productos={productos.map((p) => ({ id: p.id, nombre: p.nombre }))}
          modo="propia"
          etiqueta="Vendí yo"
          className={`${BOTON_SECUNDARIO} flex w-full px-4`}
        />
      </Tarjeta>

      {revendedoras.length === 0 ? (
        <Tarjeta>
          <p className="text-[16px] text-text-muted">Todavía no tenés ninguna revendedora asignada.</p>
        </Tarjeta>
      ) : (
        <Tarjeta como="section" className="flex flex-col gap-1">
          <h2 className="font-display text-[20px] leading-tight font-bold text-text">Tus revendedoras</h2>
          <div className="flex flex-col divide-y divide-line">
            {revendedoras.map((r) => (
              <RevendedoraCard key={r.id} revendedora={r} productos={productos} />
            ))}
          </div>
        </Tarjeta>
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
  const debe = revendedora.debeCentavos > 0;

  return (
    <div className="flex flex-col gap-2 py-2">
      <Fila
        titulo={<span className="break-words">{revendedora.nombre}</span>}
        detalle={
          <>
            Tiene {revendedora.enPoder} {envase(revendedora.enPoder)}
            {revendedora.valorEnPoderCentavos > 0 && (
              <> · valen {formatCentavos(revendedora.valorEnPoderCentavos)}</>
            )}
          </>
        }
        valor={
          debe ? (
            <Pastilla variante="debe">Debe {formatCentavos(revendedora.debeCentavos)}</Pastilla>
          ) : (
            <Pastilla variante="ok">Al día</Pastilla>
          )
        }
      />
      <button type="button" onClick={() => setAbierto(true)} className={`${BOTON_SECUNDARIO} flex w-full px-4`}>
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
      <h2 className="font-display text-[24px] text-text">Entregar a {revendedora.nombre}</h2>
      <p className="mt-1 text-[16px] text-text-muted">
        Le cobramos el costo {NEGOCIO.nombre} vigente de cada {envase(1)} — no hace falta que lo cargues vos.
      </p>

      <p className="mt-3 text-[14px] text-text-muted">
        {stockError ? stockError : textoDisponible ? `Disponible: ${textoDisponible}` : "Consultando disponible…"}
      </p>

      <div className="mt-2 flex flex-col gap-1">
        {productos.map((producto) => {
          const disponible = disponiblePorProducto?.[producto.id] ?? 0;
          return (
            <div key={producto.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <span className="text-[16px] text-text">{producto.nombre}</span>
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
        <label htmlFor="fecha-entrega" className="block text-[15px] font-semibold text-text">
          Fecha
        </label>
        <input
          id="fecha-entrega"
          type="date"
          required
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          className="mt-1.5 min-h-12 w-full border border-[#d0cec8] bg-surface px-3 text-[16px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-xl"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="nota-entrega" className="block text-[15px] font-semibold text-text">
          Nota (opcional)
        </label>
        <textarea
          id="nota-entrega"
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={2}
          className="mt-1.5 min-h-24 w-full border border-[#d0cec8] bg-surface px-3 py-3 text-[16px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-xl"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[16px] text-accent">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          disabled={totalUnidades === 0}
          onClick={() => void handleGuardar()}
          className={`${BOTON_PRIMARIO} flex-[1.6] px-4`}
        >
          Confirmar entrega
        </BotonAccion>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className={`${BOTON_SECUNDARIO} flex-1 px-4`}
        >
          Cancelar
        </button>
      </div>
    </BottomSheet>
  );
}
