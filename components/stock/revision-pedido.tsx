"use client";

import { useMemo, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { useProveedor } from "@/components/stock/proveedor-context";
import {
  calcularPedido,
  litrosAceitePorItem,
  notaAceitePedido,
  notaCostoEnvasePedido,
  notaEnvasePedido,
  notaEtiquetaPedido,
  notaTransportePctPedido,
  type CalcularPedidoInput,
} from "@/lib/dominio/costos-lote";
import {
  CLAVE_TRANSPORTE,
  claveEnvase,
  redondeosDesdeMontos,
  redondeosPedidoDesdeMontos,
  type RedondeoCosto,
} from "@/lib/dominio/lotes";
import { MontoInput } from "@/components/monto-input";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { formatPresentacion, NEGOCIO } from "@/lib/negocio";

type RevisionPedidoProps = {
  /** Entrada de `calcularPedido` SIN redondeos (`construirEntradaPedido`). */
  entrada: CalcularPedidoInput;
  /** Nombre de cada insumo de etiqueta, por `insumoId`. */
  etiquetaNombres: Record<string, string>;
  otrosDescripcion?: string;
  /** Montos reales con los que arranca (al editar: lo ya guardado, ver
   * `montosInicialesRevision`). Las claves ausentes siguen al calculado. */
  montosIniciales?: Record<string, number>;
  saving: boolean;
  error: string | null;
  onVolver: () => void;
  onConfirmar: (redondeos: RedondeoCosto[]) => void;
};

function Fila({
  label,
  nota,
  monto,
  detalle,
}: {
  label: string;
  nota?: string;
  monto: number;
  /** Línea chica debajo, de qué depende la cuenta (ej. "125 L × $5.000,00/L"). */
  detalle?: string;
}) {
  return (
    <div className="border-b border-border py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 break-words text-text">
          {label}
          {nota && <span className="text-[11px] text-text-muted"> · {nota}</span>}
        </span>
        <span className="shrink-0 text-text tabular-nums">{formatCentavos(monto)}</span>
      </div>
      {detalle && <p className="mt-1 text-[11px] leading-snug text-text-muted">{detalle}</p>}
    </div>
  );
}

/**
 * "Monto real": editable pero ESCONDIDO por default detrás de "el proveedor
 * me cobró otro número" — Fran (2026-09-15): tenerlo siempre visible confunde
 * mucho (deja montos viejos cargados sin darse cuenta y la cuenta le da
 * distinto sin entender por qué). Arranca abierto solo cuando `abierto` ya
 * viene `true` (el lote tenía un monto real guardado — ver
 * `RevisionPedido`, `abiertos` inicializado con `montosIniciales`), así lo
 * que ya estaba cargado se ve y se explica, nunca escondido.
 */
function MontoReal({
  id,
  calculadoCentavos,
  value,
  onChange,
  abierto,
  onAbrir,
  onCerrar,
  /** `true` para transporte (sin columna de costo separada, ver
   * `calcular_costos_lote` § transporte): el "monto real" sigue
   * reemplazando tanto el pago como el costo. `false` (default) para
   * envase, 0053: el "monto real" reemplaza SOLO el pago — el costo se
   * calcula aparte con el precio para costo (`notaCostoEnvasePedido`). */
  afectaCosto = false,
}: {
  id: string;
  calculadoCentavos: number;
  value: string;
  onChange: (value: string) => void;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  afectaCosto?: boolean;
}) {
  const proveedor = useProveedor();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className="min-h-11 self-start text-[12px] font-medium text-accent underline underline-offset-2"
      >
        {proveedor.sujeto} me cobró otro número
      </button>
    );
  }

  const parseado = parseMontoInput(value);
  const diferencia = parseado !== null ? parseado - calculadoCentavos : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          ¿Cuánto te cobraron en realidad?
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="text-[11px] text-text-muted underline underline-offset-2"
        >
          Usar el calculado
        </button>
      </div>
      <MontoInput
        id={id}
        ariaLabel="Monto real"
        value={value}
        onChange={onChange}
        inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text tabular-nums focus:outline-none"
      />
      <p className="mt-1 text-[11px] leading-snug text-text-muted tabular-nums">
        Este número reemplaza el calculado ({formatCentavos(calculadoCentavos)}){" "}
        {afectaCosto
          ? `tanto en lo que le pagás ${proveedor.a} como en el costo de la botella.`
          : `en lo que le pagás ${proveedor.a} — no cambia el costo de la botella.`}
        {diferencia !== 0 &&
          ` Diferencia ${diferencia > 0 ? "+" : "−"}${formatCentavos(Math.abs(diferencia))}.`}
      </p>
    </div>
  );
}

/**
 * Paso "Revisá el pedido" antes de guardar (alta en `LoteForm`, edición en
 * `CostosLoteForm`): lo que cuesta cada concepto, lo que se le paga al proveedor
 * y el costo por botella resultante. Cada concepto pagable con cuenta
 * (envasado por presentación, transporte %) tiene un "Monto real" editable,
 * prefijado con el calculado — si el proveedor cobró redondeado, se carga acá y
 * todo (a pagar, costo, costo Ananja) se recalcula en vivo con
 * `calcularPedido`, el mismo espejo del RPC. Al confirmar solo viajan los
 * montos que difieren del calculado (`redondeosDesdeMontos`).
 */
export function RevisionPedido({
  entrada,
  etiquetaNombres,
  otrosDescripcion,
  montosIniciales = {},
  saving,
  error,
  onVolver,
  onConfirmar,
}: RevisionPedidoProps) {
  const proveedor = useProveedor();
  // Solo las claves tocadas (o prefijadas con lo guardado) viven acá; el
  // resto muestra el calculado en vivo — así el transporte sigue a un
  // cambio de redondeo del envase mientras nadie lo edite a mano.
  const [montos, setMontos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(montosIniciales).map(([clave, monto]) => [clave, formatMontoDisplay(monto)]),
    ),
  );
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // Qué renglones de "Monto real" están destapados — arrancan abiertos
  // solo los que el lote YA tenía guardados con un número distinto del
  // calculado (`montosIniciales`); el resto queda detrás de "el proveedor
  // me cobró otro número" hasta que el dueño lo toque (`MontoReal`).
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () => new Set(Object.keys(montosIniciales)),
  );

  function abrirMonto(clave: string) {
    setAbiertos((prev) => new Set(prev).add(clave));
  }

  function cerrarMonto(clave: string) {
    setAbiertos((prev) => {
      const siguiente = new Set(prev);
      siguiente.delete(clave);
      return siguiente;
    });
    setMontos((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== clave)));
  }

  const montosValidos = useMemo(() => {
    const resultado: Record<string, number> = {};
    for (const [clave, texto] of Object.entries(montos)) {
      const monto = parseMontoInput(texto);
      if (monto !== null && monto > 0) resultado[clave] = monto;
    }
    return resultado;
  }, [montos]);

  const calculo = useMemo(
    () => calcularPedido({ ...entrada, redondeos: redondeosPedidoDesdeMontos(montosValidos) }),
    [entrada, montosValidos],
  );

  // Litros de TODO el pedido (todas las presentaciones) — para la nota
  // "125 L × $X/L" del renglón de aceite, que muestra un solo total.
  const litrosAceiteTotal = useMemo(
    () => entrada.items.reduce((acc, item) => acc + litrosAceitePorItem(item), 0),
    [entrada.items],
  );

  function valorDe(clave: string, calculadoCentavos: number): string {
    return montos[clave] ?? formatMontoDisplay(calculadoCentavos);
  }

  function setMonto(clave: string, valor: string) {
    setErrorLocal(null);
    setMontos((prev) => ({ ...prev, [clave]: valor }));
  }

  function confirmar() {
    const invalido = Object.values(montos).some((texto) => {
      const monto = parseMontoInput(texto);
      return monto === null || monto <= 0;
    });
    if (invalido) {
      setErrorLocal("Revisá los montos reales: tienen que ser mayores a cero.");
      return;
    }
    onConfirmar(redondeosDesdeMontos(calculo, montosValidos));
  }

  const hayYaComprado = calculo.aceiteCentavos > 0 || calculo.etiquetas.length > 0;
  const hayAPagar =
    calculo.envases.length > 0 || calculo.transporte !== null || calculo.otrosCentavos > 0;
  const variasPresentaciones = calculo.presentaciones.length > 1;
  const sinIva = entrada.envaseCobradoSinIva === true;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-[24px] leading-[1.15] text-primary">Revisá el pedido</h2>
        <p className="pt-1.5 text-[12px] leading-[1.5] text-text-muted">
          Lo que cuesta cada cosa y cuánto le pagás {proveedor.a}. Si te
          cobraron un monto redondeado, cargalo en &quot;Monto real&quot;: se ajusta lo
          que le pagás (y el transporte, si va por %) sin cambiar el costo de
          la {NEGOCIO.envase.singular} — para eso está el precio para el
          costo de cada renglón.
        </p>
      </div>

      {hayYaComprado && (
        <div className="flex flex-col">
          <span className="pb-1 text-[10px] tracking-[0.22em] text-text-muted uppercase">
            Ya comprado — suma al costo, no se paga ahora
          </span>
          {/* Fran (dueño): en un mismo pedido todas las etiquetas van
              iguales — un solo aviso acá arriba en vez de repetir "+ IVA
              21%" como si cada renglón pudiera decidirlo por su cuenta. */}
          {calculo.etiquetas.length > 0 && !entrada.incluyeIva && (
            <p className="pb-2 text-[11px] leading-snug text-text-muted">
              Pagaste las etiquetas sin IVA: el costo de cada una de abajo ya
              suma el 21%.
            </p>
          )}
          {calculo.aceiteCentavos > 0 && entrada.precioLitroAceiteCentavos != null && (
            <Fila
              label={NEGOCIO.materiaPrima.nombre}
              nota="ya comprado"
              monto={calculo.aceiteCentavos}
              detalle={notaAceitePedido(litrosAceiteTotal, entrada.precioLitroAceiteCentavos)}
            />
          )}
          {calculo.etiquetas.map((etiqueta) => {
            const cargada = entrada.etiquetas.find((e) => e.insumoId === etiqueta.insumoId);
            return (
              <Fila
                key={etiqueta.insumoId}
                label={etiquetaNombres[etiqueta.insumoId] ?? "Etiqueta"}
                nota="ya comprada"
                monto={etiqueta.costoCentavos}
                detalle={cargada && notaEtiquetaPedido(cargada, entrada.ivaPct, entrada.incluyeIva)}
              />
            );
          })}
        </div>
      )}

      {hayAPagar && (
        <div className="flex flex-col">
          <span className="pb-1 text-[10px] tracking-[0.22em] text-text-muted uppercase">
            A pagar {proveedor.a}
          </span>
          {calculo.envases.length > 0 && sinIva && (
            <p className="pb-2 text-[11px] leading-snug text-text-muted">
              {proveedor.sujeto} te cobra los envases sin IVA: el costo de cada uno de
              abajo ya suma el 21% — lo que le pagás no cambia.
            </p>
          )}

          {calculo.envases.map((envase) => {
            const clave = claveEnvase(envase.productoId);
            const precioCargado = entrada.envasePorProducto.get(envase.productoId) ?? 0;
            const precioCostoCargado =
              entrada.envaseCostoPorProducto?.get(envase.productoId) ?? precioCargado;
            return (
              <div key={clave} className="flex flex-col gap-2 border-b border-border py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[14px] text-text">
                    Envasado {formatPresentacion(envase.presentacionMl)}
                  </span>
                  <span className="text-[11px] text-text-muted tabular-nums">
                    Costo {formatCentavos(envase.totalCentavos)} · A pagar{" "}
                    <strong className="font-medium text-primary">
                      {formatCentavos(envase.aPagarCentavos)}
                    </strong>
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-text-muted tabular-nums">
                  Pago:{" "}
                  {notaEnvasePedido(
                    envase,
                    precioCargado,
                    entrada.ivaPct,
                    entrada.incluyeIva,
                    entrada.envaseCobradoSinIva,
                  )}
                </p>
                <p className="text-[11px] leading-snug text-text-muted tabular-nums">
                  Costo: {notaCostoEnvasePedido(envase, precioCostoCargado, entrada.ivaPct, sinIva)}
                </p>
                <MontoReal
                  id={`monto-real-${clave}`}
                  calculadoCentavos={envase.calculadoCentavos}
                  value={valorDe(clave, envase.calculadoCentavos)}
                  onChange={(v) => setMonto(clave, v)}
                  abierto={abiertos.has(clave)}
                  onAbrir={() => abrirMonto(clave)}
                  onCerrar={() => cerrarMonto(clave)}
                />
              </div>
            );
          })}

          {calculo.transporte?.modo === "porcentaje" && (
            <div className="flex flex-col gap-2 border-b border-border py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[14px] text-text">Transporte {calculo.transporte.pct}%</span>
                <span className="text-[11px] text-text-muted tabular-nums">
                  A pagar{" "}
                  <strong className="font-medium text-primary">
                    {formatCentavos(calculo.transporte.aPagarCentavos)}
                  </strong>
                </span>
              </div>
              <p className="text-[11px] leading-snug text-text-muted tabular-nums">
                {notaTransportePctPedido(calculo.transporte)}
              </p>
              <MontoReal
                id="monto-real-transporte"
                calculadoCentavos={calculo.transporte.calculadoCentavos}
                value={valorDe(CLAVE_TRANSPORTE, calculo.transporte.calculadoCentavos)}
                onChange={(v) => setMonto(CLAVE_TRANSPORTE, v)}
                abierto={abiertos.has(CLAVE_TRANSPORTE)}
                onAbrir={() => abrirMonto(CLAVE_TRANSPORTE)}
                onCerrar={() => cerrarMonto(CLAVE_TRANSPORTE)}
                afectaCosto
              />
            </div>
          )}

          {calculo.transporte?.modo === "fijo" && (
            <Fila label="Transporte" nota="monto fijo" monto={calculo.transporte.aPagarCentavos} />
          )}

          {calculo.otrosCentavos > 0 && (
            <Fila
              label="Otros"
              nota={otrosDescripcion?.trim() || undefined}
              monto={calculo.otrosCentavos}
            />
          )}

          <div className="flex items-baseline justify-between gap-3 pt-3">
            <span className="text-[11px] tracking-[0.14em] text-text-muted uppercase">
              Total a pagar
            </span>
            <span className="font-display text-[26px] leading-none text-primary tabular-nums">
              {formatCentavos(calculo.totalAPagarCentavos)}
            </span>
          </div>
        </div>
      )}

      {calculo.presentaciones.some((p) => p.totalCentavos > 0) && (
        <div className="flex flex-col gap-1.5 border-l-2 border-mark bg-surface-raised p-4">
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
            Costo por {NEGOCIO.envase.singular}
          </span>
          {calculo.presentaciones.map((p) => {
            const hayRedondeo = p.precios.costoAnanjaCentavos !== p.precios.costoAnanjaCalculadoCentavos;
            return (
              <div key={p.productoId} className="flex flex-col gap-0.5">
                <p className="text-[13px] leading-snug tabular-nums text-text">
                  {variasPresentaciones ? `${formatPresentacion(p.presentacionMl)}: ` : ""}
                  Costo de producción{" "}
                  <strong className="font-medium text-primary">
                    {formatCentavos(p.costoUnitarioCentavos)}
                  </strong>
                  {` → Costo Ananja (+${entrada.pcts.gananciaPct}%) `}
                  <strong className="font-medium text-primary">
                    {formatCentavos(p.precios.costoAnanjaCentavos)}
                  </strong>
                </p>
                {hayRedondeo && (
                  <p className="pl-1 text-[11px] leading-snug tabular-nums text-text-muted">
                    Calculado {formatCentavos(p.precios.costoAnanjaCalculadoCentavos)} — redondeado en
                    &quot;Costos del pedido&quot;.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(errorLocal ?? error) && (
        <p role="alert" className="text-[12px] text-accent">
          {errorLocal ?? error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onVolver}
          disabled={saving}
          className="min-h-14 flex-1 border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase disabled:opacity-45"
        >
          Volver a editar
        </button>
        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          type="button"
          onClick={confirmar}
          className="min-h-14 flex-[1.4] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Confirmar
        </BotonAccion>
      </div>
    </div>
  );
}
