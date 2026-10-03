"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { SetFormHeader } from "@/components/page-header-context";
import { hoyISO } from "@/lib/fechas";
import type { ConceptoPago } from "@/lib/dominio/gastos";
import { mensajeErrorLote, montosSugeridosPago, type ConceptoPagoLote } from "@/lib/dominio/lotes";
import { registrarPagoLote, type PagoLoteItem } from "@/lib/lotes";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types";

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
  const [fecha, setFecha] = useState(hoyISO());
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
      fecha,
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
        title="Registrar pago"
        backHref={`/stock/lotes/${loteId}`}
        backLabel="Volver al lote"
      />
      <div className="hidden items-center gap-3 lg:flex">
        <Link
          href={`/stock/lotes/${loteId}`}
          aria-label="Volver al lote"
          className="flex min-h-11 min-w-11 items-center justify-center text-[22px] leading-none text-primary"
        >
          ←
        </Link>
        <h1 className="font-display text-[22px] text-primary">Registrar pago</h1>
      </div>

      <p className="text-sm text-text-muted">
        Falta {formatCentavos(pendienteCentavos)} de este pedido.
      </p>

      {pagadoSinConceptoCentavos > 0 && (
        <p className="border-l-2 border-accent bg-surface-raised p-3 text-[12px] leading-[1.5] text-text">
          Este pedido ya tiene {formatCentavos(pagadoSinConceptoCentavos)} pagados antes de
          separar los pagos por concepto: cuentan para el total, pero no se descuentan de
          cada concepto. En total no podés cargar más de {formatCentavos(pendienteCentavos)}.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => {
            const filasGrupo = filas.filter((f) => f.clave === grupo.clave);
            const cargado = cargadoPorClave.get(grupo.clave) ?? 0;
            const excedido = cargado - grupo.pendienteCentavos;
            return (
              <div key={grupo.clave} className="flex flex-col gap-3 border-b border-border pb-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-display text-[20px] leading-tight text-primary">
                    {grupo.etiqueta}
                  </span>
                  <span className="text-[12px] text-text-muted tabular-nums">
                    Falta {formatCentavos(grupo.pendienteCentavos)}
                    {grupo.aPagarCentavos !== null &&
                    grupo.aPagarCentavos !== grupo.pendienteCentavos
                      ? ` de ${formatCentavos(grupo.aPagarCentavos)}`
                      : ""}
                  </span>
                </div>

                {filasGrupo.map((fila, i) => (
                  <div key={fila.key} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                        {filasGrupo.length > 1 ? `Medio ${i + 1}` : "Medio de pago"}
                      </span>
                      {filasGrupo.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarFila(fila.key)}
                          className="min-h-11 text-[11px] font-medium tracking-[0.08em] text-accent uppercase"
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
                      cajaClassName="flex items-baseline gap-2 border-b-2 border-primary pb-1.5"
                      simboloClassName="font-display text-[18px] text-text-muted"
                      inputClassName="font-display w-full min-w-0 text-[28px] leading-none text-primary tabular-nums"
                    />
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => agregarFila(grupo)}
                    className="min-h-11 border border-border px-4 text-[12px] font-medium tracking-[0.1em] text-primary uppercase"
                  >
                    + Agregar otro medio
                  </button>
                  {excedido > 0 && (
                    <span className="text-[12px] text-accent tabular-nums">
                      Te pasaste por {formatCentavos(excedido)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p
          className={`text-[12px] tabular-nums ${restante < 0 ? "text-accent" : "text-text-muted"}`}
        >
          Cargado {formatCentavos(totalCargado)} ·{" "}
          {restante < 0
            ? `te pasaste del total por ${formatCentavos(-restante)}`
            : `queda libre ${formatCentavos(restante)}`}
        </p>

        <div className="flex flex-col gap-2.5">
          <input
            id="pago-lote-fecha"
            type="date"
            required
            aria-label="Fecha"
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            className="min-h-12 border border-border bg-surface px-3.5 text-base text-text tabular-nums focus:border-primary"
          />
          <textarea
            id="pago-lote-nota"
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            rows={2}
            placeholder="Nota (opcional)"
            className="min-h-[60px] border border-border bg-surface px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:border-primary"
          />
        </div>

        {formError && (
          <p role="alert" className="text-xs text-accent">
            {formError}
          </p>
        )}

        <BotonAccion
          cargando={submitting}
          textoCargando="Guardando…"
          type="submit"
          className="min-h-14 bg-primary text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Registrar pago
        </BotonAccion>
      </form>
    </div>
  );
}
