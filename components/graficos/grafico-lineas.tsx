"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { NOMBRES_MES, NOMBRES_MES_ABREV } from "@/lib/fechas";
import { formatCentavosCompacto, seleccionInicial, ticksEjeY } from "@/lib/dominio/graficos";
import { formatCentavos } from "@/lib/money";

export type SerieLinea = {
  /** Año como string, ej. "2026" — también sirve de `key`/identificador
   * único dentro de `series` (un año no se repite). */
  etiqueta: string;
  /** 12 valores, enero (índice 0) a diciembre (índice 11), en centavos. */
  valores: number[];
  color: string;
};

type GraficoLineasProps = {
  /** Todos los años con datos, ya ordenados de más reciente a más viejo
   * (lo arma la página con `aniosDisponibles`) — el componente decide acá
   * adentro cuáles están activos, no la página. */
  series: SerieLinea[];
  /** Alto del `viewBox`, en píxeles — por defecto 340 (`ALTO`). Bajarlo da
   * un gráfico más compacto sin tocar el ancho (sigue siendo 100% fluido
   * via `viewBox`). Opcional y con ese mismo default: no rompe a quien ya
   * usaba el componente sin pasarlo. */
  alto?: number;
  /** Oculta los chips de selección de año — pensado para un resumen
   * embebido en otra pantalla (ej. "Tu ganancia" de la revendedora,
   * `components/revendedores/ganancia-revendedor.tsx`) donde `series` ya
   * viene acotada de antemano (típicamente año actual + año anterior) y no
   * hace falta la interacción completa de `/ganancia`. Todas las series
   * quedan activas (no hay chips para desactivarlas). El eje, la leyenda,
   * los números sobre los puntos y el tooltip se muestran en los dos modos
   * (2026-09-11: "no explica nada" era el problema, no el modo compacto en
   * sí) — solo la tabla completa se reemplaza por una versión `sr-only` en
   * este modo. Por defecto `false` — comportamiento de `/ganancia`, sin
   * cambios. */
  compacto?: boolean;
  /** Año calendario "actual" — decide qué serie se dibuja sólida (la del
   * año en curso; el resto, punteada) y qué mes se resalta. Es un número
   * plano, no una función, así que un Server Component lo puede pasar sin
   * problema (ver nota del componente sobre no pasar funciones). Por
   * defecto, el año del reloj al momento de renderizar. */
  anioActual?: number;
  /** Mes calendario "actual", 0-11. Mismo criterio que `anioActual`. */
  mesActual?: number;
  /** Frase que explica qué se grafica, arriba del gráfico. Por defecto la
   * de ventas de Ananja; "Tu ganancia" de la revendedora pasa la suya. */
  leyenda?: string;
};

const MAX_ACTIVOS = 10;
const ANCHO = 700;
const ALTO = 340;
const PAD_IZQ = 12;
const PAD_DER = 12;
const PAD_ARRIBA = 28;
const PAD_ABAJO = 32;
/** Cantidad de intervalos que le pedimos a `ticksEjeY` — ver ahí por qué el
 * resultado puede tener uno más o uno menos. */
const INTERVALOS_EJE_Y = 3;
/** Ancho mínimo, en px reales de pantalla (no unidades de `viewBox`), para
 * el que asumimos que entran los 12 meses y todas las etiquetas de valor
 * sin amontonarse. Por debajo, se muestra un mes de cada dos (siempre
 * incluyendo el actual) — spec del 2026-09-11 "on narrow widths it's OK to
 * show every other label, but never overlap". */
const ANCHO_ANGOSTO_PX = 480;
const MEDIA_ANGOSTO = `(max-width: ${ANCHO_ANGOSTO_PX}px)`;

function suscribirseAngosto(avisar: () => void): () => void {
  const mq = window.matchMedia(MEDIA_ANGOSTO);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

function leerAngosto(): boolean {
  return window.matchMedia(MEDIA_ANGOSTO).matches;
}

/** En el servidor no hay viewport: se asume ancho (igual que antes). */
function leerAngostoServidor(): boolean {
  return false;
}

function xDeMes(mes: number): number {
  const ancho = ANCHO - PAD_IZQ - PAD_DER;
  return PAD_IZQ + (ancho * mes) / 11;
}

function yDeValor(valor: number, max: number, alto: number): number {
  const altoUtil = alto - PAD_ARRIBA - PAD_ABAJO;
  if (max <= 0) return alto - PAD_ABAJO;
  return alto - PAD_ABAJO - (altoUtil * valor) / max;
}

/** Posición horizontal de un mes, en % del ancho del área de trazado —
 * mismo espaciado que `xDeMes`, para overlays HTML (texto que no debe
 * escalar con el `viewBox`, ver comentario grande más abajo). */
function pctX(mes: number): number {
  return (xDeMes(mes) / ANCHO) * 100;
}

/** Posición vertical de un valor, en % del alto del área de trazado. */
function pctY(valor: number, max: number, alto: number): number {
  return (yDeValor(valor, max, alto) / alto) * 100;
}

/** Cómo centrar horizontalmente una etiqueta HTML anclada a un mes: en
 * enero y diciembre, centrarla (`translateX(-50%)`, lo normal) la haría
 * invadir la columna fija del eje Y a la izquierda o desbordar el borde
 * derecho del gráfico — ahí se ancla del lado de adentro en cambio. */
function translateXDeMes(mes: number): string {
  if (mes === 0) return "translateX(0)";
  if (mes === 11) return "translateX(-100%)";
  return "translateX(-50%)";
}

/** Un "valle" (mínimo local: el mes anterior y el siguiente venden más) es
 * el único caso donde la línea sube hacia los dos lados justo por encima
 * del punto — si la etiqueta de valor va arriba, como en el resto de los
 * meses, una subida pronunciada la puede llegar a cruzar (se vio en la
 * revisión visual del 2026-09-11: "$500 mil" quedaba tapado por el trazo
 * que sube hacia el mes siguiente). En un pico, en cambio, las dos líneas
 * bajan alejándose del punto — arriba siempre queda libre. Por eso solo
 * los valles llevan la etiqueta abajo; el resto, arriba como siempre. */
function esValle(valores: number[], mes: number): boolean {
  const anterior = mes > 0 ? valores[mes - 1] : undefined;
  const siguiente = mes < 11 ? valores[mes + 1] : undefined;
  return (
    anterior !== undefined &&
    siguiente !== undefined &&
    valores[mes] < anterior &&
    valores[mes] < siguiente
  );
}

/** Borde entre los "carriles" de hit-area de cada mes (mitad de camino
 * entre un mes y el siguiente) — el hit-area de enero llega hasta el borde
 * izquierdo del gráfico, el de diciembre hasta el derecho. */
function bordeMes(mes: number, lado: "izq" | "der"): number {
  if (lado === "izq") return mes === 0 ? 0 : (xDeMes(mes - 1) + xDeMes(mes)) / 2;
  return mes === 11 ? ANCHO : (xDeMes(mes) + xDeMes(mes + 1)) / 2;
}

/**
 * Qué meses (de los que tienen venta > 0) llevan la etiqueta de valor
 * encima del punto. Con espacio de sobra (`angosto = false`) van todos.
 * Angosto: se descarta un mes si quedaría pegado al anterior ya elegido
 * (spec: "keep only the highest/latest ones"), salvo que sea el mes
 * actual, que siempre se muestra — y si el que ya estaba elegido justo
 * antes le queda pegado, se saca a ese en su lugar.
 */
function mesesConEtiqueta(valores: number[], mesActual: number, angosto: boolean): number[] {
  const conVenta: number[] = [];
  valores.forEach((valor, mes) => {
    if (valor > 0) conVenta.push(mes);
  });

  if (!angosto) return conVenta;

  const elegidos: number[] = [];
  for (const mes of conVenta) {
    const anterior = elegidos[elegidos.length - 1];
    const pegado = anterior !== undefined && mes - anterior < 2;
    if (pegado && mes !== mesActual) continue;
    if (pegado && mes === mesActual) elegidos.pop();
    elegidos.push(mes);
  }
  return elegidos;
}

/**
 * Gráfico de líneas de ventas por mes, una línea por año
 *. SVG propio con
 * `viewBox` (responsivo sin JS de resize) para las formas (grilla, líneas,
 * puntos) — pero todo el TEXTO (eje Y, eje X, etiquetas de valor, tooltip)
 * se dibuja como overlay HTML posicionado en % sobre un contenedor con la
 * misma relación de aspecto que el `viewBox`, no como `<text>` adentro del
 * SVG: un `<text>` de SVG se escala junto con todo el `viewBox` cuando el
 * ancho real de pantalla es menor a `ANCHO` (700), y a 375px de ancho eso
 * deja el texto ilegible. Un `<span>` posicionado con `left/top` en % en
 * cambio solo cambia de POSICIÓN con el tamaño del contenedor — su
 * `font-size` es el de siempre, nunca se achica.
 *
 * La selección de qué años se muestran (chips) es estado interno de este
 * componente, no de la página — por defecto los 3 años más recientes de
 * `series` (que ya viene ordenada desc), hasta un máximo de 10 líneas
 * activas a la vez.
 */
export function GraficoLineas({
  series,
  alto = ALTO,
  compacto = false,
  anioActual,
  mesActual,
  leyenda = "Ventas por mes (comprobantes + revendedores).",
}: GraficoLineasProps) {
  // Fallback al reloj del cliente cuando la página no pasa un año/mes
  // explícito (son números planos, no funciones — ver nota de arriba sobre
  // por qué eso es seguro pasado desde un Server Component). `useMemo` sin
  // dependencias: una sola lectura del reloj por montaje, no en cada
  // render.
  const ahora = useMemo(() => new Date(), []);
  const anio = anioActual ?? ahora.getFullYear();
  const mes = mesActual ?? ahora.getMonth();
  const etiquetaAnioActual = String(anio);

  const [activos, setActivos] = useState<Set<string>>(
    () =>
      new Set(
        seleccionInicial(series.map((s) => Number(s.etiqueta)), 3).map(String),
      ),
  );
  // Ancho real angosto: heurística simple sin ResizeObserver — el
  // componente se usa en exactamente dos contextos (el bloque compacto de
  // "Tu ganancia" en la ficha de la revendedora, siempre angosto, y
  // `/ganancia`/bloque escritorio, con lugar de sobra), así que
  // `matchMedia` sobre el viewport alcanza sin arriesgar mediciones
  // erróneas del contenedor en el primer render.
  //
  // Con `useSyncExternalStore` y no con un `useState` que lee `matchMedia`
  // al inicializar: eso daba `false` en el servidor y `true` en un celular,
  // el eje X salía distinto (12 meses vs. uno de cada dos) y React tiraba
  // "Hydration failed" (Inicio de admin y "Tu ganancia" en mobile). Así la
  // hidratación usa el valor del servidor y enseguida corrige al real.
  const angosto = useSyncExternalStore(
    suscribirseAngosto,
    leerAngosto,
    leerAngostoServidor,
  );
  const [mesTooltip, setMesTooltip] = useState<number | null>(null);
  const [tooltipFijado, setTooltipFijado] = useState(false);

  // En modo compacto no hay chips para desactivar años: todas las series
  // que llegan quedan siempre activas (la página ya las acota de antemano).
  const seriesActivas = compacto ? series : series.filter((s) => activos.has(s.etiqueta));
  const valorMaximo = Math.max(0, ...seriesActivas.flatMap((s) => s.valores));
  const ticks = ticksEjeY(valorMaximo, INTERVALOS_EJE_Y);
  const graphMax = ticks[ticks.length - 1];
  const enElTope = activos.size >= MAX_ACTIVOS;
  const haySerieAnterior = seriesActivas.some((s) => s.etiqueta !== etiquetaAnioActual);

  function alternar(etiqueta: string) {
    setActivos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(etiqueta)) {
        siguiente.delete(etiqueta);
      } else if (siguiente.size < MAX_ACTIVOS) {
        siguiente.add(etiqueta);
      }
      return siguiente;
    });
  }

  function mostrarTooltip(mesHover: number) {
    if (!tooltipFijado) setMesTooltip(mesHover);
  }
  function ocultarTooltip() {
    if (!tooltipFijado) setMesTooltip(null);
  }
  function alternarTooltip(mesClick: number) {
    if (tooltipFijado && mesTooltip === mesClick) {
      setTooltipFijado(false);
      setMesTooltip(null);
    } else {
      setTooltipFijado(true);
      setMesTooltip(mesClick);
    }
  }

  const serieActual = seriesActivas.find((s) => s.etiqueta === etiquetaAnioActual);
  const otrasSeries = seriesActivas.filter((s) => s.etiqueta !== etiquetaAnioActual);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted">
        {leyenda}
        {haySerieAnterior && " La línea punteada es el año pasado."}
      </p>

      {/* Chips de selección de año — solo en modo no compacto, donde tiene
          sentido elegir qué líneas ver. También muestran el total del año
          y, con el filete, el estilo de línea (sólido = año en curso). */}
      {!compacto && (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Años a mostrar">
            {series.map((serie) => {
              const activo = activos.has(serie.etiqueta);
              const deshabilitado = !activo && enElTope;
              const total = serie.valores.reduce((acc, v) => acc + v, 0);
              return (
                <button
                  key={serie.etiqueta}
                  type="button"
                  onClick={() => alternar(serie.etiqueta)}
                  disabled={deshabilitado}
                  aria-pressed={activo}
                  className={`flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-xs tracking-[0.08em] uppercase disabled:opacity-40 ${
                    activo ? "bg-primary text-background" : "bg-surface-raised text-text"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ backgroundColor: serie.color }}
                  />
                  <span className="tabular-nums">
                    {serie.etiqueta} · {formatCentavosCompacto(total)}
                  </span>
                </button>
              );
            })}
          </div>
          {enElTope && (
            <p className="text-[11px] text-text-muted">Máximo 10 años a la vez.</p>
          )}
        </>
      )}

      {/* Leyenda no interactiva — en modo compacto es la única forma de ver
          qué año es cuál (no hay chips); en modo no compacto complementa a
          los chips con el estilo de línea (sólido/punteado). */}
      {compacto && seriesActivas.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {seriesActivas.map((serie) => {
            const esActual = serie.etiqueta === etiquetaAnioActual;
            const total = serie.valores.reduce((acc, v) => acc + v, 0);
            return (
              <li key={serie.etiqueta} className="flex items-center gap-1.5 text-xs text-text">
                <span
                  aria-hidden="true"
                  className="inline-block w-4"
                  style={{
                    borderTop: `2px ${esActual ? "solid" : "dashed"} ${serie.color}`,
                  }}
                />
                <span className="tabular-nums">
                  {serie.etiqueta} · {formatCentavosCompacto(total)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Gráfico — si no hay ningún año activo (el usuario desmarcó todos
          los chips), no hay nada que dibujar: se avisa en el área del
          gráfico sin bloquear la interacción (los chips de arriba siguen
          activos). En modo compacto siempre hay al menos las series que
          llegaron. */}
      {seriesActivas.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">Elegí al menos un año.</p>
      ) : (
        <div className="flex gap-1">
          {/* Columna fija del eje Y — ancho real en px, nunca escala con el
              `viewBox` (ver comentario grande del componente). Sin alto
              propio (sus hijos son todos `absolute`): el flex del
              contenedor la estira (`align-items: stretch`, default) hasta
              igualar el alto del área de trazado de al lado, así los `top`
              en % de acá y de allá miden sobre el mismo alto real. */}
          <div className="relative w-10 shrink-0">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 text-[10px] whitespace-nowrap text-text-muted tabular-nums"
                style={{
                  top: `${pctY(tick, graphMax, alto)}%`,
                  transform: "translateY(-50%)",
                }}
              >
                {formatCentavosCompacto(tick)}
              </span>
            ))}
          </div>

          {/* Área de trazado: el SVG dibuja grilla/líneas/puntos (formas,
              está bien que escalen); todo el texto y la interacción de
              tooltip van como overlay HTML encima, en un contenedor con la
              misma relación de aspecto para que las posiciones en %
              coincidan exactamente con las del `viewBox`. */}
          <div className="relative min-w-0 flex-1" style={{ aspectRatio: `${ANCHO} / ${alto}` }}>
            <svg
              viewBox={`0 0 ${ANCHO} ${alto}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {/* Grilla horizontal — una línea por tick del eje Y */}
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1={PAD_IZQ}
                  x2={ANCHO - PAD_DER}
                  y1={yDeValor(tick, graphMax, alto)}
                  y2={yDeValor(tick, graphMax, alto)}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
              ))}

              {/* Una polilínea + puntos por año activo. El año en curso va
                  sólido; el resto, punteado (spec: "la línea punteada es
                  el año pasado"). */}
              {seriesActivas.map((serie) => {
                const esActual = serie.etiqueta === etiquetaAnioActual;
                const puntos = serie.valores
                  .map((valor, mesPunto) => `${xDeMes(mesPunto)},${yDeValor(valor, graphMax, alto)}`)
                  .join(" ");
                return (
                  <g key={serie.etiqueta}>
                    <polyline
                      points={puntos}
                      fill="none"
                      stroke={serie.color}
                      strokeWidth={2}
                      strokeDasharray={esActual ? undefined : "7 5"}
                    />
                    {serie.valores.map((valor, mesPunto) => {
                      const esMesActual = esActual && mesPunto === mes;
                      return (
                        <circle
                          key={mesPunto}
                          cx={xDeMes(mesPunto)}
                          cy={yDeValor(valor, graphMax, alto)}
                          r={esMesActual ? 5 : 3}
                          fill={esMesActual ? "var(--color-background)" : serie.color}
                          stroke={serie.color}
                          strokeWidth={esMesActual ? 2 : 0}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Etiquetas del eje X — nombre corto de mes. En angosto se
                muestra uno de cada dos, siempre incluyendo el mes actual. */}
            {NOMBRES_MES_ABREV.map((nombre, mesEtiqueta) => {
              if (angosto && mesEtiqueta % 2 !== mes % 2) return null;
              return (
                <span
                  key={nombre}
                  className="absolute text-[11px] text-text-muted"
                  style={{
                    left: `${pctX(mesEtiqueta)}%`,
                    top: `${((alto - PAD_ABAJO + 8) / alto) * 100}%`,
                    transform: translateXDeMes(mesEtiqueta),
                  }}
                >
                  {nombre}
                </span>
              );
            })}

            {/* Números sobre los puntos del año en curso — solo los meses
                con venta, adelgazado en angosto (ver `mesesConEtiqueta`). */}
            {serieActual &&
              mesesConEtiqueta(serieActual.valores, mes, angosto).map((mesEtiqueta) => {
                const abajo = esValle(serieActual.valores, mesEtiqueta);
                return (
                  <span
                    key={mesEtiqueta}
                    className="absolute bg-background px-0.5 text-[10px] font-medium text-text tabular-nums"
                    style={{
                      left: `${pctX(mesEtiqueta)}%`,
                      top: `${pctY(serieActual.valores[mesEtiqueta], graphMax, alto)}%`,
                      transform: `${translateXDeMes(mesEtiqueta)} ${
                        abajo ? "translateY(6px)" : "translateY(calc(-100% - 6px))"
                      }`,
                    }}
                  >
                    {formatCentavosCompacto(serieActual.valores[mesEtiqueta])}
                  </span>
                );
              })}

            {/* Hit-areas de tooltip, un "carril" vertical por mes — cubren
                todo el alto del área de trazado para que sea fácil de
                tocar en celular. Foco con teclado + tap fijan el tooltip;
                hover con mouse lo muestra sin fijar. */}
            {NOMBRES_MES.map((_, mesHit) => {
              const izq = (bordeMes(mesHit, "izq") / ANCHO) * 100;
              const der = (bordeMes(mesHit, "der") / ANCHO) * 100;
              const valorActual = serieActual?.valores[mesHit];
              const detalle = [
                serieActual
                  ? `${NOMBRES_MES[mesHit]} ${etiquetaAnioActual}: ${formatCentavos(valorActual ?? 0)}`
                  : `${NOMBRES_MES[mesHit]}: ${formatCentavos(seriesActivas[0]?.valores[mesHit] ?? 0)}`,
                ...otrasSeries.map((s) => `${s.etiqueta}: ${formatCentavos(s.valores[mesHit])}`),
              ].join(" · ");
              return (
                <button
                  key={mesHit}
                  type="button"
                  aria-label={detalle}
                  aria-pressed={tooltipFijado && mesTooltip === mesHit}
                  onMouseEnter={() => mostrarTooltip(mesHit)}
                  onMouseLeave={ocultarTooltip}
                  onFocus={() => mostrarTooltip(mesHit)}
                  onBlur={ocultarTooltip}
                  onClick={() => alternarTooltip(mesHit)}
                  className="absolute inset-y-0"
                  style={{ left: `${izq}%`, width: `${der - izq}%` }}
                />
              );
            })}

            {/* Tooltip flotante del mes activo (hover, foco o tap). */}
            {mesTooltip !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-1 z-10 flex flex-col gap-0.5 border border-border bg-surface-raised px-2.5 py-1.5 text-xs whitespace-nowrap text-text shadow-sm"
                style={
                  mesTooltip === 0
                    ? { left: 0 }
                    : mesTooltip === 11
                      ? { right: 0 }
                      : { left: `${pctX(mesTooltip)}%`, transform: "translateX(-50%)" }
                }
              >
                <span className="font-medium tabular-nums">
                  {NOMBRES_MES[mesTooltip]}{" "}
                  {serieActual ? etiquetaAnioActual : seriesActivas[0]?.etiqueta}:{" "}
                  {formatCentavos(
                    (serieActual ?? seriesActivas[0])?.valores[mesTooltip] ?? 0,
                  )}
                </span>
                {otrasSeries.map((s) => (
                  <span key={s.etiqueta} className="text-text-muted tabular-nums">
                    {s.etiqueta}: {formatCentavos(s.valores[mesTooltip])}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabla accesible — meses × años activos. Visible en modo no
          compacto (detalle completo de /ganancia); en compacto queda
          `sr-only` (el resumen embebido ya tiene el número grande arriba,
          pero un lector de pantalla igual debe poder acceder al detalle
          mes a mes — spec 2026-09-11 punto 5). */}
      {seriesActivas.length > 0 && (
        <div className={compacto ? "sr-only" : "overflow-x-auto"}>
          <table className={compacto ? undefined : "min-w-[480px] w-full text-sm"}>
            <caption className="sr-only">Ventas por mes, un año por columna</caption>
            <thead>
              <tr className="border-b border-border text-[10px] tracking-[0.16em] text-text-muted uppercase">
                <th scope="col" className="py-2 text-left font-normal">
                  Mes
                </th>
                {seriesActivas.map((serie) => (
                  <th key={serie.etiqueta} scope="col" className="py-2 text-right font-normal">
                    {serie.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOMBRES_MES.map((nombre, mesFila) => (
                <tr key={nombre} className="border-b border-border">
                  <th scope="row" className="py-2 text-left font-normal text-text">
                    {nombre}
                  </th>
                  {seriesActivas.map((serie) => (
                    <td key={serie.etiqueta} className="py-2 text-right tabular-nums text-text-muted">
                      {formatCentavos(serie.valores[mesFila])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
