"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { MontoInput } from "@/components/monto-input";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { AccionesForm } from "@/components/ui/acciones-form";
import { Aviso } from "@/components/ui/aviso";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { SeccionForm } from "@/components/ui/seccion-form";
import { Tarjeta } from "@/components/ui/tarjeta";
import { SetFormHeader } from "@/components/page-header-context";
import { formatFecha, hoyISO } from "@/lib/fechas";
import type { ConceptoPago } from "@/lib/dominio/gastos";
import { mensajeErrorLote, montosSugeridosPago, type ConceptoPagoLote } from "@/lib/dominio/lotes";
import { registrarPagoLote, type PagoLoteItem } from "@/lib/lotes";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types";
import {
  AreaTexto,
  CLASE_CAJA_MONTO,
  CLASE_ETIQUETA,
  CLASE_INPUT_MONTO_GRANDE,
  CLASE_SIMBOLO_MONTO_GRANDE,
  Campo,
  Entrada,
  MensajeError,
} from "@/components/ui/campo";

type MedioPago = Enums<"medio_pago">;

type FilaPago = {
  key: string;
  /** Clave del concepto al que pertenece la fila (`ConceptoPagoLote.clave`). */
  clave: string;
  medioPago: MedioPago | null;
  monto: string;
};

/** Un bloque de filas en pantalla — un concepto pagable, o un único bloque
 * "Pago del pedido" sin concepto si el pedido no tiene ninguno pendiente
 * (no debería pasar, pero así un dato raro no deja la pantalla vacía). */
type Grupo = {
  clave: string;
  concepto: ConceptoPago | null;
  productoId: string | null;
  etiqueta: string;
  aPagarCentavos: number | null;
  pendienteCentavos: number;
};

type PagoLoteFormProps = {
  loteId: string;
  /** Pendiente TOTAL del pedido (`v_saldo_lote.saldo_centavos`). */
  pendienteCentavos: number;
  conceptos: ConceptoPagoLote[];
  /** Pagado antes de 0038 sin concepto — descuenta del total, no de cada
   * concepto. */
  pagadoSinConceptoCentavos: number;
  /** Fecha (YYYY-MM-DD) del pedido, para el título. */
  fecha?: string | null;
};

function crearFila(clave: string, monto: string): FilaPago {
  return { key: crypto.randomUUID(), clave, medioPago: null, monto };
}

/**
 * "Registrar pago" (`/stock/lotes/[id]/pago`).
 * Desde 0038 se paga por concepto: un bloque por cada
 * concepto con algo pendiente (envasado de cada presentación, transporte,
 * otros), cada uno con una o varias filas de medio + monto (se puede pagar
 * partido) y la primera prefijada con su pendiente. Nada puede superar lo
 * pendiente de su concepto ni el pendiente total del pedido; el RPC
 * `registrar_pago_lote` lo vuelve a validar (`PAGO_EXCEDE_SALDO`).
 */
export function PagoLoteForm({
  loteId,
  pendienteCentavos,
  conceptos,
  pagadoSinConceptoCentavos,
  fecha = null,
}: PagoLoteFormProps) {
  const router = useRouter();

  const grupos: Grupo[] = useMemo(() => {
    const conPendiente = conceptos.filter((c) => c.pendienteCentavos > 0);
    if (conPendiente.length === 0) {
      return [
        {
          clave: "",
          concepto: null,
          productoId: null,
          etiqueta: "Pago del pedido",
          aPagarCentavos: null,
          pendienteCentavos,
        },
      ];
    }
    return conPendiente.map((c) => ({
      clave: c.clave,
      concepto: c.concepto,
      productoId: c.productoId,
      etiqueta: c.etiqueta,
      aPagarCentavos: c.aPagarCentavos,
      pendienteCentavos: c.pendienteCentavos,
    }));
  }, [conceptos, pendienteCentavos]);

  const [filas, setFilas] = useState<FilaPago[]>(() => {
    const sugeridos = montosSugeridosPago(grupos, pendienteCentavos);
    return grupos.map((g) =>
      crearFila(g.clave, sugeridos[g.clave] > 0 ? formatMontoDisplay(sugeridos[g.clave]) : ""),
    );
  });
  const [fechaPago, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cargadoPorClave = new Map<string, number>();
  for (const fila of filas) {
    const monto = parseMontoInput(fila.monto) ?? 0;
    cargadoPorClave.set(fila.clave, (cargadoPorClave.get(fila.clave) ?? 0) + monto);
  }
  const totalCargado = Array.from(cargadoPorClave.values()).reduce((acc, m) => acc + m, 0);
  const restante = pendienteCentavos - totalCargado;

  function actualizarFila(key: string, cambios: Partial<FilaPago>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...cambios } : f)));
  }

  function agregarFila(grupo: Grupo) {
    const libreGrupo = grupo.pendienteCentavos - (cargadoPorClave.get(grupo.clave) ?? 0);
    const sugerido = Math.min(libreGrupo, restante);
    setFilas((prev) => [
      ...prev,
      crearFila(grupo.clave, sugerido > 0 ? formatMontoDisplay(sugerido) : ""),
    ]);
  }

  function quitarFila(key: string) {
    setFilas((prev) => prev.filter((f) => f.key !== key));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const pagos: PagoLoteItem[] = [];
    for (const fila of filas) {
      const monto = parseMontoInput(fila.monto);
      if (monto === null && fila.monto.trim() !== "") {
        // Una cuenta sin terminar ("150000+") no es "fila vacía": no se saltea.
        const etiqueta = grupos.find((g) => g.clave === fila.clave)?.etiqueta ?? "Pago";
        setFormError(
          `${etiqueta}: revisá el monto (hay una cuenta sin terminar o un número que no se entiende).`,
        );
        return;
      }
      if (monto === null || monto <= 0) continue;
      if (!fila.medioPago) {
        setFormError("Elegí el medio de pago de cada fila cargada.");
        return;
      }
      const grupo = grupos.find((g) => g.clave === fila.clave);
      pagos.push({
        medioPago: fila.medioPago,
        montoCentavos: monto,
        ...(grupo?.concepto ? { concepto: grupo.concepto, productoId: grupo.productoId } : {}),
      });
    }

    if (pagos.length === 0) {
      setFormError("Cargá al menos un monto.");
      return;
    }

    for (const grupo of grupos) {
      if ((cargadoPorClave.get(grupo.clave) ?? 0) > grupo.pendienteCentavos) {
        setFormError(
          `${grupo.etiqueta}: el pago supera lo que falta (${formatCentavos(grupo.pendienteCentavos)}).`,
        );
        return;
      }
    }

    const total = pagos.reduce((acc, p) => acc + p.montoCentavos, 0);
    if (total > pendienteCentavos) {
      setFormError("El total supera lo que falta de este pedido.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await registrarPagoLote(supabase, {
      loteId,
      fecha: fechaPago,
      pagos,
      nota: nota.trim() || null,
    });

    if (error) {
      setFormError(mensajeErrorLote(error.message, error.details));
      setSubmitting(false);
      return;
    }

    router.push(`/stock/lotes/${loteId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      <SetFormHeader
        title={fecha ? `Pagar el pedido del ${formatFecha(fecha)}` : "Pagar el pedido"}
        backHref={`/stock/lotes/${loteId}`}
        backLabel="Volver al pedido"
      />
      <FormHeaderDesktop />
      <p className="-mt-2 text-[15px] text-text-muted">¿Cuánto pagaste de este pedido y cómo?</p>

      <Tarjeta>
        <NumeroGrande etiqueta="Falta pagar" tono="debe">
          {formatCentavos(pendienteCentavos)}
        </NumeroGrande>
      </Tarjeta>

      {pagadoSinConceptoCentavos > 0 && (
        <Aviso>
          <p>
            Este pedido ya tiene {formatCentavos(pagadoSinConceptoCentavos)} pagados antes de
            separar los pagos por concepto: cuentan para el total, pero no se descuentan de
            cada concepto. En total no podés cargar más de {formatCentavos(pendienteCentavos)}.
          </p>
        </Aviso>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {grupos.map((grupo) => {
          const filasGrupo = filas.filter((f) => f.clave === grupo.clave);
          const cargado = cargadoPorClave.get(grupo.clave) ?? 0;
          const excedido = cargado - grupo.pendienteCentavos;
          return (
            <SeccionForm
              key={grupo.clave}
              titulo={grupo.etiqueta}
              descripcion={
                <span className="tabular-nums">
                  Falta {formatCentavos(grupo.pendienteCentavos)}
                  {grupo.aPagarCentavos !== null && grupo.aPagarCentavos !== grupo.pendienteCentavos
                    ? ` de ${formatCentavos(grupo.aPagarCentavos)}`
                    : ""}
                </span>
              }
            >
              {filasGrupo.map((fila, i) => (
                <div key={fila.key} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={CLASE_ETIQUETA}>
                      {filasGrupo.length > 1 ? `Medio ${i + 1}` : "Medio de pago"}
                    </span>
                    {filasGrupo.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarFila(fila.key)}
                        className="min-h-11 px-2 text-[15px] font-semibold text-accent"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <MedioPagoChips
                    value={fila.medioPago}
                    onChange={(medio) => actualizarFila(fila.key, { medioPago: medio })}
                    ocultarRotulo
                  />
                  <MontoInput
                    ariaLabel={`Monto ${grupo.etiqueta}${filasGrupo.length > 1 ? ` ${i + 1}` : ""}`}
                    value={fila.monto}
                    onChange={(valor) => actualizarFila(fila.key, { monto: valor })}
                    placeholder="0,00"
                    cajaClassName={CLASE_CAJA_MONTO}
                    simboloClassName={CLASE_SIMBOLO_MONTO_GRANDE}
                    inputClassName={CLASE_INPUT_MONTO_GRANDE}
                  />
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => agregarFila(grupo)}
                  className="min-h-12 rounded-xl border border-[#d0cec8] px-4 text-[15px] font-semibold text-primary"
                >
                  + Agregar otro medio
                </button>
                {excedido > 0 && (
                  <span className="text-[14px] text-accent tabular-nums">
                    Te pasaste por {formatCentavos(excedido)}
                  </span>
                )}
              </div>
            </SeccionForm>
          );
        })}

        <p
          className={`text-[14px] tabular-nums ${restante < 0 ? "text-accent" : "text-text-muted"}`}
        >
          Cargado {formatCentavos(totalCargado)} ·{" "}
          {restante < 0
            ? `te pasaste del total por ${formatCentavos(-restante)}`
            : `queda libre ${formatCentavos(restante)}`}
        </p>

        <SeccionForm titulo="¿Cuándo lo pagaste?">
          <Campo id="pago-lote-fecha" etiqueta="Fecha">
            <Entrada
              type="date"
              required
              value={fechaPago}
              onChange={(event) => setFecha(event.target.value)}
              className="tabular-nums"
            />
          </Campo>
          <Campo id="pago-lote-nota" etiqueta="Nota" opcional>
            <AreaTexto value={nota} onChange={(event) => setNota(event.target.value)} rows={2} />
          </Campo>
        </SeccionForm>

        {formError && <MensajeError>{formError}</MensajeError>}

        <AccionesForm
          etiqueta="Registrar pago"
          cargando={submitting}
          cancelarHref={`/stock/lotes/${loteId}`}
          fija
        />
      </form>
    </div>
  );
}
