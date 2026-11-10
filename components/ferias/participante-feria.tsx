"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { BotonAccion } from "@/components/boton-accion";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { LinkBoton } from "@/components/ui/link-boton";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { CLASE_ETIQUETA, Campo, MensajeError, Selector } from "@/components/ui/campo";
import type { ParticipanteFeriaRow, ProductoParticipanteRow } from "@/lib/data/ferias";
import { mensajeErrorFeria } from "@/lib/dominio/feria";
import { participacionCerrada, sePuedeQuitar, textoDegustacion } from "@/lib/dominio/feria-admin";
import { hoyISO } from "@/lib/fechas";
import {
  feriaCargarDegustacion,
  feriaQuitarDegustacion,
  feriaQuitarParticipante,
  feriaReabrirParticipacion,
} from "@/lib/ferias";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type HojaAbierta =
  | { tipo: "quitar" }
  | { tipo: "reabrir" }
  | { tipo: "degustacion" }
  | { tipo: "quitarDeg"; id: string; nombre: string };

type Props = {
  feriaId: string;
  feriaAbierta: boolean;
  participante: ParticipanteFeriaRow;
  productos: ProductoParticipanteRow[];
  /** Productos activos, para "Cargar degustación". */
  productosActivos?: { id: string; nombre: string }[];
};

function Numero({ rotulo, valor, resaltar = false }: { rotulo: string; valor: number; resaltar?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`text-[18px] font-semibold tabular-nums ${resaltar && valor > 0 ? "text-accent" : "text-text"}`}>
        {valor}
      </span>
      <span className="text-[13px] text-text-muted">{rotulo}</span>
    </div>
  );
}

/** Una persona en la feria: sus números, el desglose por producto y lo que el
 * admin puede hacer con ella (cargar botellas, quitar, cerrar por ella, reabrir). */
export function ParticipanteFeria({ feriaId, feriaAbierta, participante: p, productos, productosActivos = [] }: Props) {
  const router = useRouter();
  // Qué hoja está abierta (una sola a la vez). `quitarDeg` lleva el producto cuya degustación se quita.
  const [hoja, setHoja] = useState<HojaAbierta | null>(null);
  // Degustación a cargar: producto elegido + cantidad.
  const [productoDeg, setProductoDeg] = useState("");
  const [cantidadDeg, setCantidadDeg] = useState(1);
  // Qué acción está en vuelo (null = ninguna): el loader gira solo en el botón tocado.
  const [trabajando, setTrabajando] = useState<HojaAbierta["tipo"] | null>(null);
  // El error vive dentro de la hoja abierta: se limpia al abrir otra y al cerrar.
  const [error, setError] = useState<string | null>(null);

  function abrir(nueva: HojaAbierta) {
    setError(null);
    setHoja(nueva);
  }
  function cerrar() {
    if (trabajando !== null) return;
    setError(null);
    setHoja(null);
  }

  const vendedorId = p.vendedor_id ?? "";
  const cerrada = participacionCerrada(p.estado);
  const declarado = (p.efectivo_centavos ?? 0) + (p.mercado_pago_centavos ?? 0) + (p.banco_centavos ?? 0);

  const conCarga = productos.filter((x) => (x.degustadas_carga ?? 0) > 0 && x.producto_id);
  const textoDeg = textoDegustacion(p.degustadas_carga, p.degustadas_cierre);

  /** Corre la acción de la hoja abierta: con error la hoja queda abierta con el mensaje; sin error se cierra. */
  async function ejecutar(
    tipo: HojaAbierta["tipo"],
    accion: () => PromiseLike<{ error: { message: string } | null }>,
  ): Promise<boolean> {
    if (trabajando !== null) return false;
    setTrabajando(tipo);
    setError(null);
    const { error: rpcError } = await accion();
    setTrabajando(null);
    if (rpcError) {
      setError(mensajeErrorFeria(rpcError.message));
      return false;
    }
    setHoja(null);
    router.refresh();
    return true;
  }

  async function cargarDegustacion() {
    if (!productoDeg || cantidadDeg <= 0) {
      setError("Elegí el producto y la cantidad.");
      return;
    }
    const ok = await ejecutar("degustacion", () =>
      feriaCargarDegustacion(createClient(), {
        feriaId,
        vendedorId,
        items: [{ productoId: productoDeg, cantidad: cantidadDeg }],
        fecha: hoyISO(),
        nota: null,
      }),
    );
    if (ok) {
      setProductoDeg("");
      setCantidadDeg(1);
    }
  }

  async function quitarDegustacion() {
    if (hoja?.tipo !== "quitarDeg") return;
    const { id } = hoja;
    await ejecutar("quitarDeg", () => feriaQuitarDegustacion(createClient(), feriaId, vendedorId, id));
  }

  async function confirmar() {
    if (hoja?.tipo !== "quitar" && hoja?.tipo !== "reabrir") return;
    const tipo = hoja.tipo;
    await ejecutar(tipo, () =>
      tipo === "quitar"
        ? feriaQuitarParticipante(createClient(), feriaId, vendedorId)
        : feriaReabrirParticipacion(createClient(), feriaId, vendedorId),
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[17px] font-semibold break-words text-text">{p.vendedor_nombre}</h3>
        <Pastilla variante={cerrada ? "ok" : "aviso"}>{cerrada ? "Cerró" : "Pendiente"}</Pastilla>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Numero rotulo="Llevó" valor={p.entregadas ?? 0} />
        <Numero rotulo="Vendió" valor={p.vendidas ?? 0} />
        <Numero rotulo="Devolvió" valor={p.devueltas ?? 0} />
        <Numero rotulo="Falta devolver" valor={p.faltan ?? 0} resaltar />
      </div>

      <p className="text-[14px] text-text-muted">
        {textoDeg && <>Degustación: {textoDeg}. </>}
        Vendido: <span className="font-semibold tabular-nums text-text">{formatCentavos(p.total_vendido_centavos ?? 0)}</span>
        {cerrada && (
          <>
            {" · "}Declaró {formatCentavos(declarado)} (efectivo {formatCentavos(p.efectivo_centavos ?? 0)}, Mercado
            Pago {formatCentavos(p.mercado_pago_centavos ?? 0)}, banco {formatCentavos(p.banco_centavos ?? 0)})
          </>
        )}
      </p>

      {productos.length > 0 && (
        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[15px] font-semibold text-text [&::-webkit-details-marker]:hidden">
            Ver por producto
          </summary>
          <ul className="divide-y divide-line border-t border-border px-3">
            {productos.map((x) => (
              <li key={x.producto_id} className="flex flex-col gap-0.5 py-2">
                <span className="text-[15px] font-semibold text-text">{x.producto_nombre}</span>
                <span className="text-[14px] text-text-muted tabular-nums">
                  Llevó {x.entregadas ?? 0} · vendió {x.vendidas ?? 0} · devolvió {x.devueltas ?? 0} · degustación{" "}
                  {textoDegustacion(x.degustadas_carga, x.degustadas_cierre) ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!cerrada && feriaAbierta && conCarga.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-border px-3 py-1" aria-label="Degustación cargada">
          {conCarga.map((x) => (
            <li key={x.producto_id} className="flex items-center justify-between gap-3 text-[14px] text-text-muted">
              <span className="min-w-0">
                {x.producto_nombre}: {x.degustadas_carga} para degustación (a cargo de Ananja)
              </span>
              <button
                type="button"
                onClick={() => abrir({ tipo: "quitarDeg", id: x.producto_id ?? "", nombre: x.producto_nombre ?? "producto" })}
                className="min-h-11 shrink-0 px-2 text-[14px] font-semibold text-accent"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {feriaAbierta && (
        <div className="flex flex-wrap gap-2">
          {!cerrada && (
            <>
              <LinkBoton href={`/ferias/${feriaId}/entregar/${vendedorId}`} className={`${BOTON_SECUNDARIO} flex px-4`}>
                Cargar botellas
              </LinkBoton>
              <button type="button" onClick={() => abrir({ tipo: "degustacion" })} className={`${BOTON_SECUNDARIO} flex px-4`}>
                Cargar degustación
              </button>
              <LinkBoton href={`/ferias/${feriaId}/cerrar/${vendedorId}`} className={`${BOTON_SECUNDARIO} flex px-4`}>
                Cerrar por ella
              </LinkBoton>
              {sePuedeQuitar(p) && (
                <button type="button" onClick={() => abrir({ tipo: "quitar" })} className={`${BOTON_SECUNDARIO} flex px-4`}>
                  Quitar
                </button>
              )}
            </>
          )}
          {cerrada && (
            <button type="button" onClick={() => abrir({ tipo: "reabrir" })} className={`${BOTON_SECUNDARIO} flex px-4`}>
              Reabrir
            </button>
          )}
        </div>
      )}

      <BottomSheet open={hoja?.tipo === "quitar" || hoja?.tipo === "reabrir"} onClose={cerrar} bloqueada={trabajando !== null} ariaLabel={hoja?.tipo === "quitar" ? "Quitar de la feria" : "Reabrir participación"} variant="accent">
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-text">
            {hoja?.tipo === "quitar" ? `¿Quitar a ${p.vendedor_nombre} de la feria?` : `¿Reabrir la participación de ${p.vendedor_nombre}?`}
          </h2>
          <p className="text-[15px] text-text-muted">
            {hoja?.tipo === "quitar"
              ? "Todavía no tiene botellas cargadas, así que no se pierde nada."
              : "Se deshacen las ventas, la devolución y las degustaciones de su cierre; después tiene que volver a cerrar."}
          </p>
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex flex-col gap-2">
            <BotonAccion
              cargando={trabajando === "quitar" || trabajando === "reabrir"}
              textoCargando="Un momento…"
              disabled={trabajando !== null}
              onClick={confirmar}
              className={`${BOTON_PRIMARIO} flex w-full px-4`}
            >
              {hoja?.tipo === "quitar" ? "Sí, quitar" : "Sí, reabrir"}
            </BotonAccion>
            <button
              type="button"
              disabled={trabajando !== null}
              onClick={cerrar}
              className={`${BOTON_SECUNDARIO} flex w-full px-4`}
            >
              Cancelar
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={hoja?.tipo === "degustacion"} onClose={cerrar} bloqueada={trabajando !== null} ariaLabel="Cargar degustación" anchoMaximo="sm:max-w-lg">
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-text">Degustación para {p.vendedor_nombre}</h2>
          <p className="text-[15px] text-text-muted">
            Salen del stock como degustación a cargo de Ananja: no son una entrega ni suman deuda.
          </p>
          <Campo id={`deg-producto-${vendedorId}`} etiqueta="Producto">
            <Selector
              value={productoDeg}
              onChange={(event) => setProductoDeg(event.target.value)}
            >
              <option value="">Elegí un producto</option>
              {productosActivos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <div className="flex items-center justify-between gap-3">
            <span className={CLASE_ETIQUETA}>Cantidad</span>
            <CantidadStepper
              size="sm"
              value={cantidadDeg}
              onChange={setCantidadDeg}
              min={1}
              ariaLabelSufijo=" de degustación"
            />
          </div>
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex flex-col gap-2">
            <BotonAccion
              cargando={trabajando === "degustacion"}
              textoCargando="Cargando…"
              disabled={trabajando !== null}
              onClick={cargarDegustacion}
              className={`${BOTON_PRIMARIO} flex w-full px-4`}
            >
              Cargar degustación
            </BotonAccion>
            <button
              type="button"
              disabled={trabajando !== null}
              onClick={cerrar}
              className={`${BOTON_SECUNDARIO} flex w-full px-4`}
            >
              Cancelar
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={hoja?.tipo === "quitarDeg"} onClose={cerrar} bloqueada={trabajando !== null} ariaLabel="Quitar degustación" variant="accent">
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-text">
            ¿Quitar la degustación de {hoja?.tipo === "quitarDeg" ? hoja.nombre : ""} de {p.vendedor_nombre}?
          </h2>
          <p className="text-[15px] text-text-muted">Las botellas vuelven al stock del pedido del que salieron.</p>
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex flex-col gap-2">
            <BotonAccion
              cargando={trabajando === "quitarDeg"}
              textoCargando="Un momento…"
              disabled={trabajando !== null}
              onClick={quitarDegustacion}
              className={`${BOTON_PRIMARIO} flex w-full px-4`}
            >
              Sí, quitar
            </BotonAccion>
            <button
              type="button"
              disabled={trabajando !== null}
              onClick={cerrar}
              className={`${BOTON_SECUNDARIO} flex w-full px-4`}
            >
              Cancelar
            </button>
          </div>
        </div>
      </BottomSheet>
    </Tarjeta>
  );
}
