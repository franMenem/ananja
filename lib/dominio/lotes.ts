/**
 * Cálculos puros de Pedidos/Lotes de producción: estado y validación de
 * "Costos del pedido", prefills, armado del `p_costos` para los RPC y
 * traducción de sus errores (`mensajeErrorLote`). Las escrituras
 * (`crearLote`, `fijarCostosLote`, `actualizarCostoLoteVigente`,
 * `registrarPagoLote`) viven en `lib/lotes.ts`.
 */

import {
  aplicarIva,
  calcularCostoAceite,
  calcularPedido,
  type CalcularPedidoInput,
  type PorcentajesLote,
  type PreviewEtiquetaInput,
  type RecetaEtiquetaConInsumo,
  type RedondeosPedido,
} from "@/lib/dominio/costos-lote";
import { evaluarNumero } from "@/lib/dominio/calculo-monto";
import { etiquetaConceptoPago, type ConceptoPago } from "@/lib/dominio/gastos";
import { formatCentavos, formatMonto, parseMontoInput } from "@/lib/money";
import type { Database } from "@/lib/types";

/** Precio + envío de UN insumo de etiqueta (frente o reverso son insumos
 * DISTINTOS — ver `supabase/migrations/0017_insumos.sql` § seed) tal como
 * los escribe el dueño en pantalla. */
export interface EtiquetaCostoState {
  precioUnitario: string;
  envio: string;
  /** 0053_pago_vs_costo_insumo.sql: precio para EL COSTO de la botella, si
   * es distinto del pagado — "" = usa `precioUnitario` (el mismo que se
   * pagó/ya se compró). */
  precioCosto: string;
}

/** Modo de transporte del pedido — mutuamente excluyente
 * (`supabase/migrations/0029_costos_reales_lote.sql` § TRANSPORTE_AMBIGUO). */
export type TransporteModo = "porcentaje" | "fijo";

/**
 * Estado (en pantalla, como strings de `<input>`) de la sección "Costos
 * del pedido" — compartido por el alta (`LoteForm`, dentro de `crear_lote`
 * vía `p_costos`) y la edición (`CostosLoteForm`, vía `fijar_costos_lote`).
 * Un campo vacío ("") significa "no cargado todavía", a diferencia de "0"
 * (cargado, en cero) — mismo criterio que `p_costos` en
 * `supabase/migrations/0029_costos_reales_lote.sql` § `aplicar_costos_lote`.
 */
export interface CostosLoteState {
  /** Precio del dólar del pedido — ARS por USD, en centavos de ARS (ej.
   * "1.000,00" -> 100000). Se combina con `precioLitroAceiteUsd` para el
   * costo del aceite (`calcularCostoAceite`, `lib/costos-lote.ts`) —
   * `supabase/migrations/0030_dolar_por_lote.sql`. */
  dolar: string;
  /** Precio del litro de aceite EN USD del pedido, en centavos de USD (ej.
   * "4,00" -> 400 = USD 4,00). Mismo parseo (`parseMontoInput`) que los
   * campos en pesos — acá el "peso" de la cuenta es el dólar, no el signo
   * "$". */
  precioLitroAceiteUsd: string;
  /** Override ARS explícito y PUNTUAL del precio del litro de aceite — "o
   * poné el precio del litro en pesos" en pantalla. GANA sobre `dolar` ×
   * `precioLitroAceiteUsd` cuando está cargado (`calcularCostoAceite`), pero
   * a diferencia de esos dos NUNCA se persiste en `lotes_produccion`: es
   * una excepción de esta llamada nomás (ver
   * `PCostosLote.precio_litro_aceite_centavos`). Campo secundario en
   * pantalla — el camino normal es dólar + USD/L. */
  precioLitroAceite: string;
  /** Un insumo de etiqueta (frente/retro, por presentación) por clave =
   * `insumo_id` — `CostosLoteCampos` renderiza una fila por cada insumo de
   * etiqueta que usan las presentaciones del pedido (vía `recetas`), no un
   * precio único para todas. */
  etiquetasPorInsumo: Record<string, EtiquetaCostoState>;
  /** Precio de envase por presentación producida, clave = `producto_id`. */
  envasePorProducto: Record<string, string>;
  /** 0053: precio para EL COSTO de la botella por presentación, si es
   * distinto del pagado — clave ausente/"" = usa `envasePorProducto` (el
   * mismo que se pagó). */
  envaseCostoPorProducto: Record<string, string>;
  /** 0054_costo_ananja_redondeado.sql: costo Ananja REDONDEADO por
   * presentación, clave = `producto_id` — "" = "usa el calculado" (costo
   * real × (1+ganancia%), con decimales). Es lo que se le exige a las
   * revendedoras y desde donde se encadenan los sugeridos mayorista/
   * minorista (decisión de Fran). */
  costoAnanjaRedondeadoPorProducto: Record<string, string>;
  /** % sobre (aceite + envase + etiquetas, a costo) de cada presentación, o monto fijo
   * repartido por volumen — nunca los dos a la vez. */
  transporteModo: TransporteModo;
  transportePct: string;
  transporteFijo: string;
  otros: string;
  otrosDescripcion: string;
  /** "Los precios de etiquetas los cargo sin IVA" — `true`: los precios de
   * etiqueta que se cargan acá son NETOS y el RPC les suma el IVA (Ananja
   * es monotributo, ese IVA no es recuperable — parte del costo). `false`
   * (default en `costosLoteStateVacio` — el dueño carga los precios CON
   * IVA): ya vienen con IVA incluido, se guardan tal cual. Desde 0038 ya
   * NO gobierna el envase (ver `envaseSinIva`). Nunca aplica al aceite. */
  sinIva: boolean;
  /** "el proveedor me cobró el envasado sin IVA" (0038, corregida en 0048) —
   * `true`: el precio cargado es NETO (sin IVA) y el 21% se le suma TANTO a
   * lo que se le paga al proveedor COMO al costo de la botella — a pagar = costo,
   * siempre. `false`: el precio cargado ya es lo que se paga y lo que
   * cuesta, sin sumarle nada. */
  envaseSinIva: boolean;
  ivaPct: string;
  /** % de ganancia de Ananja / mayorista / minorista sugerido — ENCADENADOS
   * (costo → costo Ananja → mayorista sobre costo Ananja → minorista sobre
   * el MAYORISTA, no sobre costo Ananja — ver
   * `supabase/migrations/0029_costos_reales_lote.sql`). A diferencia de los
   * campos de costo, estos SIEMPRE tienen un valor (nunca "sin cargar"):
   * 30/15/40 por default, o los % reales de otro lote cuando
   * `prefillCostosLote` los recibe. */
  gananciaPct: string;
  mayoristaPct: string;
  minoristaPct: string;
}

export function costosLoteStateVacio(): CostosLoteState {
  return {
    dolar: "",
    precioLitroAceiteUsd: "",
    precioLitroAceite: "",
    etiquetasPorInsumo: {},
    envasePorProducto: {},
    envaseCostoPorProducto: {},
    costoAnanjaRedondeadoPorProducto: {},
    transporteModo: "porcentaje",
    transportePct: "8",
    transporteFijo: "",
    otros: "",
    otrosDescripcion: "",
    // Default OFF ("no, cargo los precios CON IVA" — decisión del dueño):
    // `sinIva: false` → `construirPCostosLote` manda
    // `precios_incluyen_iva: true`, mismo default seguro que la columna
    // (`supabase/migrations/0029_costos_reales_lote.sql`). El switch sigue
    // disponible para el otro caso; al editar un lote existente,
    // `prefillCostosLote` siempre prioriza lo que ese lote ya tenía
    // guardado (`config.precioIncluyeIva`) por sobre este default.
    sinIva: false,
    envaseSinIva: false,
    ivaPct: "21",
    gananciaPct: "30",
    mayoristaPct: "15",
    minoristaPct: "40",
  };
}

/** "30" / "20,5" / "20.5" -> 30 / 20.5, y también cuentas ("10,5*2") — modo
 * "porcentaje" de `lib/calculo-monto.ts` (un único separador es siempre
 * decimal: son porcentajes, no montos). Sin tope de decimales a propósito
 * (antes tampoco redondeaba; la base guarda `numeric(5,2)`), salvo el
 * redondeo a 6 decimales de una división que no termina ("100/3"). `""` o
 * texto que no resuelve a un número: `null` ("no cargado"/inválido). */
export function parsePctInput(valor: string): number | null {
  return evaluarNumero(valor, "porcentaje", 6);
}

/** Una fila de `lote_costos` — lo mínimo que hace falta para prefijar
 * `CostosLoteState` con los valores del lote anterior o del mismo lote
 * (edición). `insumo_id`/`neto_centavos`/`envio_centavos` (0029) identifican
 * a qué insumo de etiqueta corresponde cada fila y su precio/envío tal
 * como se cargaron (antes de aplicarles IVA). */
export type LoteCostoRow = Pick<
  Database["public"]["Tables"]["lote_costos"]["Row"],
  | "concepto"
  | "producto_id"
  | "insumo_id"
  | "costo_unitario_centavos"
  | "neto_centavos"
  | "costo_neto_centavos"
  | "envio_centavos"
  | "total_centavos"
  | "descripcion"
>;

/** Centavos -> string de `<input>` en formato argentino sin el "$" (mismo
 * criterio que `formatMontoDisplay`, pero tolerando `null`/`undefined` con
 * "" en vez de "0,00" — acá "sin cargar" y "cargado en cero" son estados
 * distintos, ver `CostosLoteState`). */
function centavosAInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Configuración del lote de referencia para prefijar "Costos del pedido"
 * más allá de lo que ya está en `lote_costos` — los % encadenados, el IVA y
 * el transporte % viven en `lotes_produccion`, no en `lote_costos`. */
export interface ConfigLotePrefill {
  pcts?: PorcentajesLote | null;
  ivaPct?: number | null;
  precioIncluyeIva?: boolean | null;
  /** `lotes_produccion.envase_cobrado_sin_iva` (0038) del lote de
   * referencia — `null`/ausente: `false`. */
  envaseCobradoSinIva?: boolean | null;
  /** `null`/ausente: el lote de referencia usaba transporte fijo (o
   * ninguno) — el modo por default queda en "porcentaje" 8% igual
   * (`costosLoteStateVacio`) salvo que haya una fila `transporte` fija en
   * `filas` (ver abajo). */
  transportePct?: number | null;
  /** Precio por litro vigente de `v_tanque_aceite` — cuando está presente
   * GANA sobre cualquier fila `aceite` de `filas` (que en `/stock/lotes/nuevo`
   * pertenece a un lote DISTINTO, ya viejo): el tanque es el dato vivo, no
   * hace falta arrastrar un precio de compra pasado. `/stock/lotes/[id]/costos`
   * no manda este campo — ahí `filas` es del MISMO lote que se edita, y
   * mostrar lo que ya tiene cargado importa más que el promedio de hoy. */
  tanquePrecioLitroAceiteCentavos?: number | null;
  /** Dólar (ARS por USD) y precio del litro de aceite en USD YA cargados en
   * `lotes_produccion` — del mismo lote (`/stock/lotes/[id]/costos`) o del
   * lote más reciente que los tenga (`/stock/lotes/nuevo`, mismo criterio
   * de herencia que `crear_lote`). `null`/ausente: ninguno de los dos
   * campos se prefija (el pedido todavía no tiene dólar cargado). */
  dolarCentavos?: number | null;
  precioLitroAceiteUsdCentavos?: number | null;
  /** Última compra de cada insumo de etiqueta (`obtenerUltimasComprasInsumos`,
   * `lib/insumos.ts`) — precio = monto del gasto / cantidad de esa compra
   * puntual. Precedencia (build "insumos en cero"): el lote de
   * referencia (`filas`, arriba) GANA cuando ya trae ese insumo cargado;
   * esto es el fallback cuando no. `{}`/ausente: ningún insumo de etiqueta
   * tiene compras registradas todavía, el campo queda vacío. */
  ultimasComprasEtiquetas?: Record<string, { precioUnitarioCentavos: number; fecha: string }> | null;
}

/**
 * Arma el prefill de "Costos del pedido" a partir de las `lote_costos` de
 * un lote (el anterior con costos, para `/stock/lotes/nuevo`, o el mismo
 * lote, para `/stock/lotes/[id]/costos`). El envase y las etiquetas se
 * prefijan solo para las presentaciones/insumos que están en `productoIds`
 * (las que se están produciendo/editando ahora) — un insumo o presentación
 * nueva que el lote de referencia no tenía queda vacío, no hay con qué
 * prefijarlo.
 */
export function prefillCostosLote(
  filas: LoteCostoRow[],
  productoIds: string[],
  config?: ConfigLotePrefill | null,
  recetasEtiqueta: Pick<RecetaEtiquetaConInsumo, "productoId" | "insumoId">[] = [],
  /** `lote_items.costo_ananja_redondeado_centavos` (0054) de ESTE lote, por
   * `producto_id` — `null`/ausente = sin redondeo cargado todavía. */
  redondeoAnanjaPorProducto: Record<string, number | null> = {},
): CostosLoteState {
  const vacio = costosLoteStateVacio();

  const filaAceite = filas.find((f) => f.concepto === "aceite");
  const transporteFila = filas.find((f) => f.concepto === "transporte");
  const otro = filas.find((f) => f.concepto === "otro");

  // Envase: `neto_centavos` es el precio tal como se cargó (desde 0038, lo
  // que cobra el proveedor). Caso legado: una fila escrita en modo viejo con
  // `precios_incluyen_iva = false` (la UI anterior a 0038 gross-eaba el
  // envase y lo pagaba CON IVA) — prefijar el neto con el switch nuevo
  // apagado bajaría lo a pagar un 21% al re-guardar. Se detecta exacto
  // (costo unitario = neto + IVA) y se prefija el precio CON IVA, que es lo
  // que efectivamente se venía pagando: re-guardar deja los mismos números.
  const envaseSinIva = config?.envaseCobradoSinIva ?? vacio.envaseSinIva;
  const envasePorProducto: Record<string, string> = {};
  // 0053_pago_vs_costo_insumo.sql: precio para el costo, SOLO si la fila
  // guardada tenía uno distinto del pagado (`costo_neto_centavos` no nulo)
  // — "" = "usa el mismo que pagás" (fallback en pantalla y en el RPC).
  const envaseCostoPorProducto: Record<string, string> = {};
  for (const productoId of productoIds) {
    const fila = filas.find((f) => f.concepto === "envase" && f.producto_id === productoId);
    if (!fila) continue;
    const esLegadoConIva =
      !envaseSinIva &&
      config?.precioIncluyeIva === false &&
      fila.neto_centavos != null &&
      fila.costo_unitario_centavos != null &&
      fila.costo_unitario_centavos !== fila.neto_centavos &&
      fila.costo_unitario_centavos === aplicarIva(fila.neto_centavos, config.ivaPct ?? 21, false);
    envasePorProducto[productoId] = centavosAInput(
      esLegadoConIva ? fila.costo_unitario_centavos : (fila.neto_centavos ?? fila.costo_unitario_centavos),
    );
    if (fila.costo_neto_centavos != null) {
      envaseCostoPorProducto[productoId] = centavosAInput(fila.costo_neto_centavos);
    }
  }

  const etiquetasPorInsumo: Record<string, EtiquetaCostoState> = {};
  for (const fila of filas) {
    if (fila.concepto !== "etiqueta" || !fila.insumo_id) continue;
    etiquetasPorInsumo[fila.insumo_id] = {
      precioUnitario: centavosAInput(fila.neto_centavos),
      envio: centavosAInput(fila.envio_centavos),
      precioCosto: centavosAInput(fila.costo_neto_centavos),
    };
  }

  // Filas de etiqueta LEGADAS (anteriores a 0029: `insumo_id` null,
  // `costo_unitario_centavos` es el precio único que en ese momento se
  // aplicaba a TODOS los insumos de etiqueta de esa presentación — ver
  // `supabase/migrations/0028_costos_por_lote.sql`). `aplicar_costos_lote`
  // reemplaza TODAS las `lote_costos` del lote al guardar: si no se
  // reconstruye acá un precio por insumo para estas filas, "Editar costos"
  // las pierde en silencio. Se prefija por cada insumo de etiqueta que la
  // presentación usa HOY (vía `recetasEtiqueta`), envío 0 (no existía en
  // el formato viejo) — y solo si ese insumo no vino ya de una fila 0029+
  // (tagueada, arriba), que es siempre más precisa.
  const precioLegadoPorProducto = new Map<string, number>();
  for (const fila of filas) {
    if (fila.concepto === "etiqueta" && !fila.insumo_id && fila.producto_id && fila.costo_unitario_centavos != null) {
      precioLegadoPorProducto.set(fila.producto_id, fila.costo_unitario_centavos);
    }
  }
  for (const receta of recetasEtiqueta) {
    if (etiquetasPorInsumo[receta.insumoId]) continue;
    const precioLegado = precioLegadoPorProducto.get(receta.productoId);
    if (precioLegado === undefined) continue;
    etiquetasPorInsumo[receta.insumoId] = {
      precioUnitario: centavosAInput(precioLegado),
      envio: centavosAInput(0),
      precioCosto: "",
    };
  }

  // Última compra por insumo de etiqueta (build "insumos en cero"):
  // fallback de ÚLTIMO recurso, solo para el insumo que ni el lote de
  // referencia (filas 0029+ arriba) ni el formato legado le hayan puesto ya
  // un precio. Envío en blanco (la compra de insumos no distingue envío del
  // resto del gasto) — el dueño lo completa si corresponde.
  if (config?.ultimasComprasEtiquetas) {
    for (const [insumoId, compra] of Object.entries(config.ultimasComprasEtiquetas)) {
      if (etiquetasPorInsumo[insumoId]) continue;
      etiquetasPorInsumo[insumoId] = {
        precioUnitario: centavosAInput(compra.precioUnitarioCentavos),
        envio: "",
        precioCosto: "",
      };
    }
  }

  // Precio por litro (override ARS): el vivo de v_tanque_aceite gana (ver
  // ConfigLotePrefill); si no vino, la fila `aceite` de `filas` (el mismo
  // lote, en /stock/lotes/[id]/costos) — PERO solo cuando esa fila vino de
  // un override ARS explícito o del tanque, nunca cuando vino de USD×dólar
  // (0030): `aplicar_costos_lote` solo escribe `descripcion` en la rama
  // USD×dólar (ver `supabase/migrations/0030_dolar_por_lote.sql`), así que
  // `descripcion != null` es la señal de que ese costo_unitario_centavos es
  // un ARS YA derivado de dólar/USD, no un override que tenga sentido
  // reproducir acá — ese precio se prefija por separado, en `dolar`/
  // `precioLitroAceiteUsd` abajo. Sin esto, editar un lote con dólar
  // cargado "congelaría" el ARS derivado de hoy como override explícito la
  // próxima vez que se guarde, aunque el dueño no haya tocado nada.
  const aceiteVieneDeUsd = filaAceite?.descripcion != null;
  const precioLitroAceite =
    config?.tanquePrecioLitroAceiteCentavos !== undefined
      ? centavosAInput(config.tanquePrecioLitroAceiteCentavos)
      : aceiteVieneDeUsd
        ? ""
        : centavosAInput(filaAceite?.costo_unitario_centavos);

  // Dólar / USD por litro (0030): siempre desde `config` (lotes_produccion
  // del mismo lote, o del lote más reciente que los tenga) — `lote_costos`
  // nunca los guarda por línea, solo el ARS ya resuelto de ese momento.
  const dolar = centavosAInput(config?.dolarCentavos);
  const precioLitroAceiteUsd = centavosAInput(config?.precioLitroAceiteUsdCentavos);

  // Transporte: si el lote de referencia tenía % (lotes_produccion), ese
  // modo gana — es un % relativo, tiene sentido heredarlo tal cual entre
  // pedidos. Si no, y hay una fila `transporte` compartida (monto fijo,
  // producto_id null) del lote de referencia, se prefija ese monto en modo
  // fijo. Sin ninguno de los dos: default de `costosLoteStateVacio`
  // (porcentaje 8%).
  let transporteModo: TransporteModo = vacio.transporteModo;
  let transportePct = vacio.transportePct;
  let transporteFijo = vacio.transporteFijo;
  if (config?.transportePct != null) {
    transporteModo = "porcentaje";
    transportePct = String(config.transportePct);
  } else if (transporteFila && transporteFila.producto_id === null) {
    transporteModo = "fijo";
    transporteFijo = centavosAInput(transporteFila.total_centavos);
  }

  const costoAnanjaRedondeadoPorProducto: Record<string, string> = {};
  for (const productoId of productoIds) {
    const redondeo = redondeoAnanjaPorProducto[productoId];
    if (redondeo != null) costoAnanjaRedondeadoPorProducto[productoId] = centavosAInput(redondeo);
  }

  return {
    dolar,
    precioLitroAceiteUsd,
    precioLitroAceite,
    etiquetasPorInsumo,
    envasePorProducto,
    envaseCostoPorProducto,
    costoAnanjaRedondeadoPorProducto,
    transporteModo,
    transportePct,
    transporteFijo,
    otros: centavosAInput(otro?.total_centavos),
    otrosDescripcion: otro?.descripcion ?? "",
    sinIva: config?.precioIncluyeIva != null ? !config.precioIncluyeIva : vacio.sinIva,
    envaseSinIva,
    ivaPct: config?.ivaPct != null ? String(config.ivaPct) : vacio.ivaPct,
    gananciaPct: config?.pcts ? String(config.pcts.gananciaPct) : vacio.gananciaPct,
    mayoristaPct: config?.pcts ? String(config.pcts.mayoristaPct) : vacio.mayoristaPct,
    minoristaPct: config?.pcts ? String(config.pcts.minoristaPct) : vacio.minoristaPct,
  };
}

/**
 * Prefill de "Actualizar costos del depósito" (`/stock/lotes/[id]/actualizar-costos`,
 * `0052_costo_vigente_lote.sql`) a partir de la ÚLTIMA `lote_valoraciones`
 * de este lote, si ya hubo una actualización previa — corrección de la
 * revisión adversarial: la primera versión siempre precargaba desde los
 * costos ORIGINALES del pedido (`lote_costos`, como "Editar costos"), así
 * que una segunda actualización perdía lo que el dueño acababa de cargar
 * la vez anterior. Inverso de `construirPCostosLote`: como `costos_jsonb`
 * es exactamente el `p_costos` que se mandó (auditoría, ver la tabla), no
 * hace falta reconstruir nada — se lee directo. Los % de
 * ganancia/mayorista/minorista NO salen de `costos_jsonb` (puede no
 * traerlos, si esa actualización los heredó) sino de las columnas propias
 * de `lote_valoraciones` — el RPC las resuelve y las persiste siempre, así
 * que son la fuente confiable.
 */
export function prefillCostosLoteDesdeValoracion(
  costosJsonb: PCostosLote,
  margenes: { gananciaPct: number; mayoristaPct: number; minoristaPct: number },
): CostosLoteState {
  const vacio = costosLoteStateVacio();

  const envasePorProducto: Record<string, string> = {};
  for (const envase of costosJsonb.envases) {
    envasePorProducto[envase.producto_id] = centavosAInput(envase.precio_unitario_centavos);
  }

  // Costo Ananja redondeado (0054): `costos_jsonb` es exactamente el
  // `p_costos` que se mandó la vez anterior (mismo criterio que el resto de
  // esta función) — se lee directo, sin reconstruir nada. Una entrada con
  // `monto_centavos: null` (redondeo explícitamente borrado esa vez) se
  // prefija vacía, igual que si nunca hubiera venido.
  const costoAnanjaRedondeadoPorProducto: Record<string, string> = {};
  for (const redondeo of costosJsonb.costos_ananja_redondeados ?? []) {
    if (redondeo.monto_centavos != null) {
      costoAnanjaRedondeadoPorProducto[redondeo.producto_id] = centavosAInput(redondeo.monto_centavos);
    }
  }

  const etiquetasPorInsumo: Record<string, EtiquetaCostoState> = {};
  for (const etiqueta of costosJsonb.etiquetas) {
    etiquetasPorInsumo[etiqueta.insumo_id] = {
      precioUnitario: centavosAInput(etiqueta.precio_unitario_centavos),
      envio: centavosAInput(etiqueta.envio_unitario_centavos),
      // "Actualizar costos del depósito" es `soloCosto` (un único campo por
      // renglón, ver `CostosLoteCampos`/`ActualizarCostoLoteForm`): lo que
      // esta pantalla mandó la vez anterior como `precio_unitario_centavos`
      // YA ES el precio para costo — no hace falta reconstruir un campo
      // aparte acá.
      precioCosto: "",
    };
  }

  return {
    dolar: centavosAInput(costosJsonb.dolar_centavos),
    precioLitroAceiteUsd: centavosAInput(costosJsonb.precio_litro_aceite_usd_centavos),
    precioLitroAceite: centavosAInput(costosJsonb.precio_litro_aceite_centavos),
    etiquetasPorInsumo,
    envasePorProducto,
    envaseCostoPorProducto: {},
    costoAnanjaRedondeadoPorProducto,
    transporteModo: costosJsonb.transporte_pct != null ? "porcentaje" : "fijo",
    transportePct:
      costosJsonb.transporte_pct != null ? String(costosJsonb.transporte_pct) : vacio.transportePct,
    transporteFijo:
      costosJsonb.transporte_centavos != null
        ? centavosAInput(costosJsonb.transporte_centavos)
        : vacio.transporteFijo,
    otros: centavosAInput(costosJsonb.otros_centavos),
    otrosDescripcion: costosJsonb.otros_descripcion ?? "",
    sinIva: costosJsonb.precios_incluyen_iva != null ? !costosJsonb.precios_incluyen_iva : vacio.sinIva,
    envaseSinIva: costosJsonb.envase_cobrado_sin_iva ?? vacio.envaseSinIva,
    ivaPct: costosJsonb.iva_pct != null ? String(costosJsonb.iva_pct) : vacio.ivaPct,
    gananciaPct: String(margenes.gananciaPct),
    mayoristaPct: String(margenes.mayoristaPct),
    minoristaPct: String(margenes.minoristaPct),
  };
}

/** `true` si alguna `lote_costos` de etiqueta es del formato anterior a
 * 0029 (`insumo_id` null) — para que la pantalla de "Editar costos" avise
 * que conviene revisar los precios que `prefillCostosLote` reconstruyó
 * (ver el comentario ahí arriba). */
export function tieneCostoEtiquetaLegado(
  filas: Pick<LoteCostoRow, "concepto" | "insumo_id">[],
): boolean {
  return filas.some((f) => f.concepto === "etiqueta" && !f.insumo_id);
}

/** Un envase del contrato de `p_costos` (ver `aplicar_costos_lote`). Precio
 * neto u con-IVA según `precios_incluyen_iva` — default de columna `true`
 * (el precio se usa TAL CUAL, sin sumarle IVA): es el default SEGURO para
 * cualquier caller que no mande el campo (ver `PCostosLote.precios_incluyen_iva`
 * más abajo). */
export interface EnvaseCosto {
  producto_id: string;
  precio_unitario_centavos: number;
  /** 0053_pago_vs_costo_insumo.sql: precio para EL COSTO de la botella, si
   * es distinto del pagado — `null`/ausente = usa `precio_unitario_centavos`.
   * Nunca afecta `a_pagar_centavos` (lo que se paga al proveedor). */
  precio_costo_unitario_centavos?: number | null;
}

/** Un insumo de etiqueta (frente o reverso) del contrato de `p_costos`
 * (`supabase/migrations/0029_costos_reales_lote.sql`). `precio_unitario_centavos`
 * neto o con-IVA según `precios_incluyen_iva`; `envio_unitario_centavos`
 * NUNCA lleva IVA. */
export interface EtiquetaCosto {
  insumo_id: string;
  precio_unitario_centavos: number;
  envio_unitario_centavos: number;
  /** 0053: precio para EL COSTO, si es distinto del pagado/ya comprado —
   * `null`/ausente = usa `precio_unitario_centavos`. */
  precio_costo_unitario_centavos?: number | null;
}

/**
 * Shape exacto de `p_costos` que esperan `crear_lote`/`fijar_costos_lote`
 * (`supabase/migrations/0029_costos_reales_lote.sql`).
 */
export interface PCostosLote {
  /** ARS por USD del pedido (0030) — se PERSISTE en `lotes_produccion` (a
   * diferencia de `precio_litro_aceite_centavos`, override puntual de esta
   * llamada nomás): `crear_lote` la hereda del lote más reciente que la
   * tenga cuando se omite, `fijar_costos_lote` conserva la que el lote ya
   * tenía. */
  dolar_centavos: number | null;
  /** Precio del litro de aceite en USD del pedido (0030) — mismo criterio
   * de persistencia/herencia que `dolar_centavos`. Se combina con ella para
   * el costo del aceite (`calcularCostoAceite` — ARS explícito de abajo
   * GANA sobre este × `dolar_centavos`, que a su vez gana sobre el
   * promedio de `v_tanque_aceite`). */
  precio_litro_aceite_usd_centavos: number | null;
  precio_litro_aceite_centavos: number | null;
  /** FALLBACK legado (0028): un precio único aplicado a TODOS los insumos
   * de etiqueta del lote, envío 0. `construirPCostosLote` ya no lo arma
   * (siempre manda `etiquetas`) — queda en el contrato porque el RPC lo
   * sigue aceptando para `p_costos` escritos a mano/legados. */
  precio_etiqueta_centavos: number | null;
  /** Un precio + envío por insumo de etiqueta (frente y reverso son
   * insumos distintos). */
  etiquetas: EtiquetaCosto[];
  envases: EnvaseCosto[];
  /** Monto fijo, compartido por volumen (como 0028). Mutuamente excluyente
   * con `transporte_pct` — mandar los dos es `TRANSPORTE_AMBIGUO`. */
  transporte_centavos: number | null;
  /** % sobre (aceite + envase + etiquetas, a costo) de CADA presentación — línea
   * directa, no compartida (0029). */
  transporte_pct: number | null;
  otros_centavos: number | null;
  otros_descripcion: string | null;
  /** Ausentes (`null`): `crear_lote` los hereda del lote más reciente,
   * `fijar_costos_lote` deja los que el lote ya tenía — ver el comentario
   * de cada RPC en `supabase/migrations/0029_costos_reales_lote.sql`. */
  ganancia_pct: number | null;
  mayorista_pct: number | null;
  minorista_pct: number | null;
  /** % de IVA no recuperable (Ananja es monotributo) aplicado a envase/
   * etiqueta — NUNCA al aceite. Default de columna: 21. */
  iva_pct: number | null;
  /** `true` (default SEGURO de columna): los precios de `envases`/
   * `etiquetas` en este `p_costos` se guardan TAL CUAL, sin sumarles IVA —
   * es el comportamiento de cualquier caller viejo que no sabe nada de
   * IVA (evita inflar un 21% los precios de la UI deployada hoy, que
   * nunca manda este campo). `false`: los precios vienen en NETO y el RPC
   * los gross-ea por `iva_pct` — la UI nueva lo manda explícitamente
   * cuando el usuario elige "cargo los precios sin IVA". `null`/ausente:
   * `crear_lote` hereda del lote más reciente (o `true` si no hay
   * ninguno), `fijar_costos_lote` conserva lo que el lote ya tenía — NUNCA
   * lo cambia solo. */
  precios_incluyen_iva: boolean | null;
  /** 0038 (corregida en 0048): "el proveedor cobró el envasado sin IVA". La UI
   * SIEMPRE lo manda (activa el modo nuevo de envase: con `true`, el 21% se
   * suma tanto al costo COMO a lo que se le paga al proveedor — a pagar = costo,
   * siempre). Un caller viejo que no lo manda conserva lo guardado en el
   * lote (`false` = comportamiento de 0030). */
  envase_cobrado_sin_iva: boolean;
  /** 0038: montos reales cobrados por concepto — solo los que difieren de
   * lo calculado. La UI siempre manda el array (vacío si no hay). */
  redondeos: RedondeoCosto[];
  /** 0054_costo_ananja_redondeado.sql: costo Ananja REDONDEADO por
   * presentación — la UI manda una entrada por cada `producto_id` de este
   * pedido (`monto_centavos: null` = "sin redondeo, usa el calculado"). Un
   * `producto_id` que el array no menciona no se toca (el RPC conserva lo
   * que ya tenía) — `construirPCostosLote` siempre manda el set completo,
   * así que en la práctica no queda ninguno afuera. Ausente/`undefined`: un
   * caller viejo que no sabe nada de esto — el RPC no toca ningún redondeo. */
  costos_ananja_redondeados?: CostoAnanjaRedondeado[];
}

/** Un monto real (redondeo) del contrato de `p_costos.redondeos` (0038). */
export type RedondeoCosto =
  | { concepto: "envase"; producto_id: string; monto_centavos: number }
  | { concepto: "transporte"; monto_centavos: number };

/** Una entrada de `p_costos.costos_ananja_redondeados` (0054). */
export interface CostoAnanjaRedondeado {
  producto_id: string;
  /** `null` = "sin redondeo cargado para esta presentación, usa el
   * calculado". */
  monto_centavos: number | null;
}

/**
 * Convierte `CostosLoteState` (strings de pantalla) al jsonb `p_costos` de
 * `crear_lote`/`fijar_costos_lote` — `null` si NINGÚN costo real se cargó
 * (el caller entonces no manda `p_costos`, un lote se puede guardar sin
 * costos y completarlos después). Un campo con texto que no parsea a un
 * monto válido se trata como no cargado (el formulario ya valida antes de
 * llegar acá si hace falta bloquear el submit).
 *
 * `etiquetaInsumoIds`: los insumos de etiqueta que `CostosLoteCampos`
 * efectivamente mostró para este pedido (según `recetas` de las
 * presentaciones con cantidad > 0) — mismo criterio defensivo que
 * `productoIds` para envase: un insumo que quedó en `state` pero ya no
 * corresponde a ninguna presentación de este pedido no se manda.
 */
export function construirPCostosLote(
  state: CostosLoteState,
  productoIds: string[],
  etiquetaInsumoIds: string[] = [],
  redondeos: RedondeoCosto[] = [],
): PCostosLote | null {
  const precioLitroAceite = state.precioLitroAceite.trim()
    ? parseMontoInput(state.precioLitroAceite)
    : null;
  const dolar = state.dolar.trim() ? parseMontoInput(state.dolar) : null;
  const precioLitroAceiteUsd = state.precioLitroAceiteUsd.trim()
    ? parseMontoInput(state.precioLitroAceiteUsd)
    : null;
  const otros = state.otros.trim() ? parseMontoInput(state.otros) : null;

  const envases: EnvaseCosto[] = productoIds.flatMap((productoId) => {
    const raw = state.envasePorProducto[productoId];
    if (!raw || !raw.trim()) return [];
    const monto = parseMontoInput(raw);
    if (monto === null) return [];
    // 0053: "" (o texto que no parsea) = "usa el mismo que pagás" — el RPC
    // y `calcularEnvasePedido` ya hacen ese fallback con `null`.
    const rawCosto = state.envaseCostoPorProducto[productoId];
    const precioCosto = rawCosto && rawCosto.trim() ? parseMontoInput(rawCosto) : null;
    return [
      {
        producto_id: productoId,
        precio_unitario_centavos: monto,
        precio_costo_unitario_centavos: precioCosto,
      },
    ];
  });

  const etiquetas: EtiquetaCosto[] = etiquetaInsumoIds.flatMap((insumoId) => {
    const fila = state.etiquetasPorInsumo[insumoId];
    if (!fila || !fila.precioUnitario.trim()) return [];
    const precio = parseMontoInput(fila.precioUnitario);
    if (precio === null) return [];
    const envio = fila.envio.trim() ? parseMontoInput(fila.envio) : 0;
    const precioCosto = fila.precioCosto.trim() ? parseMontoInput(fila.precioCosto) : null;
    return [
      {
        insumo_id: insumoId,
        precio_unitario_centavos: precio,
        envio_unitario_centavos: envio ?? 0,
        precio_costo_unitario_centavos: precioCosto,
      },
    ];
  });

  // Costo Ananja redondeado (0054): una entrada por producto_id de este
  // pedido, siempre — `monto_centavos: null` cuando el campo está vacío
  // ("usa el calculado"), no se omite la entrada (eso le permitiría al RPC
  // distinguir "no cargó nada" de "lo borró a propósito", ver el
  // comentario de `PCostosLote.costos_ananja_redondeados`).
  const costosAnanjaRedondeados: CostoAnanjaRedondeado[] = productoIds.map((productoId) => {
    const raw = state.costoAnanjaRedondeadoPorProducto?.[productoId];
    const monto = raw && raw.trim() ? parseMontoInput(raw) : null;
    return { producto_id: productoId, monto_centavos: monto };
  });

  const transportePctVal =
    state.transporteModo === "porcentaje" ? parsePctInput(state.transportePct) : null;
  const transporteFijoVal =
    state.transporteModo === "fijo" && state.transporteFijo.trim()
      ? parseMontoInput(state.transporteFijo)
      : null;

  // Dólar/USD cuentan como "algo cargado" aunque todavía no basten para una
  // línea de aceite (falta el otro) — igual hay que persistirlos en
  // lotes_produccion para que el próximo pedido los herede (crear_lote) o
  // para no perder el que se acaba de cargar (fijar_costos_lote).
  const algoCargado =
    precioLitroAceite !== null ||
    dolar !== null ||
    precioLitroAceiteUsd !== null ||
    etiquetas.length > 0 ||
    envases.length > 0 ||
    (transporteFijoVal !== null && transporteFijoVal > 0) ||
    (otros !== null && otros > 0) ||
    costosAnanjaRedondeados.some((c) => c.monto_centavos !== null);

  if (!algoCargado) return null;

  return {
    dolar_centavos: dolar,
    precio_litro_aceite_usd_centavos: precioLitroAceiteUsd,
    precio_litro_aceite_centavos: precioLitroAceite,
    precio_etiqueta_centavos: null,
    etiquetas,
    envases,
    transporte_centavos: transporteFijoVal,
    transporte_pct: transportePctVal,
    otros_centavos: otros,
    otros_descripcion: otros !== null && otros > 0 ? state.otrosDescripcion.trim() || null : null,
    iva_pct: parsePctInput(state.ivaPct),
    precios_incluyen_iva: !state.sinIva,
    envase_cobrado_sin_iva: state.envaseSinIva,
    redondeos,
    costos_ananja_redondeados: costosAnanjaRedondeados,
    // Los % viajan junto con cualquier costo que se esté guardando (arriba,
    // `algoCargado`) — así el pedido queda con el margen que se ve en
    // pantalla en vez de depender de que el caller adivine si hace falta
    // mandarlos. Con NINGÚN costo cargado (p_costos completo es `null`,
    // arriba) el RPC igual resuelve los % (hereda del lote anterior /
    // conserva los del lote, según el caso) — no hace falta mandarlos acá.
    ganancia_pct: parsePctInput(state.gananciaPct),
    mayorista_pct: parsePctInput(state.mayoristaPct),
    minorista_pct: parsePctInput(state.minoristaPct),
  };
}

/**
 * Campos de "Costos del pedido" con algo escrito que no se entiende (una
 * cuenta sin terminar como "1520*" o "21+", texto inválido).
 * `construirPCostosLote` los trata igual que un campo vacío ("no cargado")
 * y `crear_lote` heredaría el dólar/los % del pedido anterior, así que
 * `LoteForm` y `CostosLoteForm` frenan el guardado antes con esta lista.
 * Devuelve el nombre de cada campo con problema, sin repetir, en el orden
 * de la pantalla. Un campo vacío no es un problema.
 */
export function camposCostosLoteInvalidos(
  state: CostosLoteState,
  productoIds: string[],
  etiquetaInsumoIds: string[] = [],
): string[] {
  const invalidos: string[] = [];
  const monto = (texto: string | undefined, nombre: string) => {
    if (texto && texto.trim() && parseMontoInput(texto) === null) invalidos.push(nombre);
  };
  const pct = (texto: string | undefined, nombre: string) => {
    if (texto && texto.trim() && parsePctInput(texto) === null) invalidos.push(nombre);
  };

  monto(state.dolar, "el precio del dólar");
  monto(state.precioLitroAceiteUsd, "el precio del litro en USD");
  monto(state.precioLitroAceite, "el precio del litro en pesos");
  for (const insumoId of etiquetaInsumoIds) {
    const fila = state.etiquetasPorInsumo[insumoId];
    monto(fila?.precioUnitario, "el precio de una etiqueta");
    monto(fila?.envio, "el envío de una etiqueta");
    monto(fila?.precioCosto, "el precio para el costo de una etiqueta");
  }
  for (const productoId of productoIds) {
    monto(state.envasePorProducto[productoId], "el precio por envase");
    monto(state.envaseCostoPorProducto[productoId], "el precio para el costo de un envase");
    monto(state.costoAnanjaRedondeadoPorProducto?.[productoId], "el costo Ananja redondeado");
  }
  if (state.transporteModo === "porcentaje") pct(state.transportePct, "el transporte %");
  else monto(state.transporteFijo, "el transporte");
  monto(state.otros, "otros");
  pct(state.ivaPct, "el IVA %");
  pct(state.gananciaPct, "la ganancia %");
  pct(state.mayoristaPct, "el mayorista %");
  pct(state.minoristaPct, "el minorista %");

  return [...new Set(invalidos)];
}

/** "Revisá el precio del dólar y la ganancia %: …" para `camposCostosLoteInvalidos`. */
export function mensajeCamposInvalidos(campos: string[]): string {
  const lista =
    campos.length === 1 ? campos[0] : `${campos.slice(0, -1).join(", ")} y ${campos.at(-1)}`;
  return `Revisá ${lista}: hay una cuenta sin terminar o un número que no se entiende.`;
}

/** Lo mínimo de una presentación del pedido para calcularlo. */
export type ItemPedido = { productoId: string; presentacionMl: number; cantidad: number };

/**
 * `CostosLoteState` (strings de pantalla) → entrada de `calcularPedido`
 * (lib/costos-lote.ts), sin redondeos. Compartido por la vista previa en vivo
 * de `CostosLoteCampos` y el paso "Revisá el pedido" de alta y edición, así
 * los dos calculan con exactamente los mismos números. Aceite: ARS explícito >
 * USD × dólar > promedio del tanque (si el caller lo pasa) > sin aceite.
 */
export function construirEntradaPedido(args: {
  state: CostosLoteState;
  items: ItemPedido[];
  recetasEtiqueta: RecetaEtiquetaConInsumo[];
  etiquetaInsumoIds: string[];
  precioLitroTanqueCentavos?: number | null;
}): CalcularPedidoInput {
  const { state, items, recetasEtiqueta, etiquetaInsumoIds } = args;
  const parseCampo = (valor: string) => (valor.trim() ? parseMontoInput(valor) : null);
  const numero = (valor: string) => parsePctInput(valor) ?? 0;

  const precioLitroResuelto = calcularCostoAceite({
    litros: 1,
    usdPorLitroCentavos: parseCampo(state.precioLitroAceiteUsd),
    dolarCentavos: parseCampo(state.dolar),
    arsPorLitroCentavos: parseCampo(state.precioLitroAceite),
  });

  const etiquetas: PreviewEtiquetaInput[] = etiquetaInsumoIds.flatMap((insumoId) => {
    const fila = state.etiquetasPorInsumo[insumoId];
    const precio = fila ? parseCampo(fila.precioUnitario) : null;
    if (precio === null) return [];
    return [
      {
        insumoId,
        precioUnitarioCentavos: precio,
        envioUnitarioCentavos: (fila && parseCampo(fila.envio)) ?? 0,
        precioCostoUnitarioCentavos: (fila && parseCampo(fila.precioCosto)) ?? null,
      },
    ];
  });

  const envasePorProducto = new Map<string, number>();
  const envaseCostoPorProducto = new Map<string, number>();
  const costoAnanjaRedondeadoPorProducto = new Map<string, number>();
  for (const item of items) {
    const monto = parseCampo(state.envasePorProducto[item.productoId] ?? "");
    if (monto !== null) envasePorProducto.set(item.productoId, monto);
    const montoCosto = parseCampo(state.envaseCostoPorProducto[item.productoId] ?? "");
    if (montoCosto !== null) envaseCostoPorProducto.set(item.productoId, montoCosto);
    const montoRedondeado = parseCampo(state.costoAnanjaRedondeadoPorProducto?.[item.productoId] ?? "");
    if (montoRedondeado !== null) costoAnanjaRedondeadoPorProducto.set(item.productoId, montoRedondeado);
  }

  return {
    items: items.map((i) => ({ productoId: i.productoId, presentacionMl: i.presentacionMl, cantidad: i.cantidad })),
    recetasEtiqueta,
    precioLitroAceiteCentavos: precioLitroResuelto ?? args.precioLitroTanqueCentavos ?? null,
    etiquetas,
    envasePorProducto,
    envaseCostoPorProducto,
    costoAnanjaRedondeadoPorProducto,
    transporte:
      state.transporteModo === "porcentaje"
        ? { modo: "porcentaje", porcentajeSobreAceiteMasEnvase: numero(state.transportePct) }
        : { modo: "fijo", totalCentavos: parseCampo(state.transporteFijo) ?? 0 },
    otrosCentavos: parseCampo(state.otros) ?? 0,
    ivaPct: numero(state.ivaPct),
    incluyeIva: !state.sinIva,
    pcts: {
      gananciaPct: numero(state.gananciaPct),
      mayoristaPct: numero(state.mayoristaPct),
      minoristaPct: numero(state.minoristaPct),
    },
    envaseCobradoSinIva: state.envaseSinIva,
  };
}

/** Clave de un concepto con monto real editable en "Revisá el pedido":
 * `envase:<producto_id>` o `transporte` (solo transporte %). */
export function claveEnvase(productoId: string): string {
  return `envase:${productoId}`;
}
export const CLAVE_TRANSPORTE = "transporte";

/** Montos reales (centavos, por clave) → redondeos para `calcularPedido`. */
export function redondeosPedidoDesdeMontos(montos: Record<string, number>): RedondeosPedido {
  const envase: Record<string, number> = {};
  for (const [clave, monto] of Object.entries(montos)) {
    if (clave.startsWith("envase:")) envase[clave.slice("envase:".length)] = monto;
  }
  return { envase, transporteCentavos: montos[CLAVE_TRANSPORTE] ?? null };
}

/**
 * Montos reales → `p_costos.redondeos`, SOLO los que difieren de lo
 * calculado. `calculo` tiene que venir de `calcularPedido` con estos mismos
 * montos aplicados: así el "calculado" del transporte ya incluye el efecto
 * de los redondeos de envase sobre su base (igual que el RPC).
 */
export function redondeosDesdeMontos(
  calculo: ReturnType<typeof calcularPedido>,
  montos: Record<string, number>,
): RedondeoCosto[] {
  const redondeos: RedondeoCosto[] = [];
  for (const envase of calculo.envases) {
    const monto = montos[claveEnvase(envase.productoId)];
    if (monto != null && monto !== envase.calculadoCentavos) {
      redondeos.push({ concepto: "envase", producto_id: envase.productoId, monto_centavos: monto });
    }
  }
  if (calculo.transporte?.modo === "porcentaje") {
    const monto = montos[CLAVE_TRANSPORTE];
    if (monto != null && monto !== calculo.transporte.calculadoCentavos) {
      redondeos.push({ concepto: "transporte", monto_centavos: monto });
    }
  }
  return redondeos;
}

/** Lo que el pedido YA tiene guardado como a pagar, por clave de
 * redondeo (`lote_costos.a_pagar_centavos`, 0038). */
export function aPagarGuardadoPorConcepto(
  filas: { concepto: string; producto_id: string | null; a_pagar_centavos: number | null }[],
): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const fila of filas) {
    if (fila.a_pagar_centavos == null) continue;
    const clave =
      fila.concepto === "envase" && fila.producto_id
        ? claveEnvase(fila.producto_id)
        : fila.concepto === "transporte"
          ? CLAVE_TRANSPORTE
          : null;
    if (clave) resultado[clave] = (resultado[clave] ?? 0) + fila.a_pagar_centavos;
  }
  return resultado;
}

/**
 * Montos reales con los que arranca "Revisá el pedido" al EDITAR: se respeta
 * lo guardado de un concepto solo si su cálculo (sin redondeos) no cambió
 * respecto de lo que el pedido tenía — si el dueño tocó un precio, lo
 * guardado ya no corresponde y arranca del calculado nuevo. Solo devuelve
 * las claves cuyo monto guardado difiere del calculado (el resto sigue al
 * calculado en vivo). El transporte se compara contra el calculado con los
 * redondeos de envase guardados ya aplicados (así un transporte que nunca
 * se redondeó no queda "congelado" si después se cambia un envase).
 */
export function montosInicialesRevision(args: {
  entradaInicial: CalcularPedidoInput;
  entradaActual: CalcularPedidoInput;
  aPagarGuardado: Record<string, number>;
}): Record<string, number> {
  const { entradaInicial, entradaActual, aPagarGuardado } = args;
  const inicial = calcularPedido({ ...entradaInicial, redondeos: null });
  const actual = calcularPedido({ ...entradaActual, redondeos: null });
  const montos: Record<string, number> = {};

  for (const envase of actual.envases) {
    const clave = claveEnvase(envase.productoId);
    const guardado = aPagarGuardado[clave];
    const envaseInicial = inicial.envases.find((e) => e.productoId === envase.productoId);
    if (
      guardado != null &&
      envaseInicial &&
      envaseInicial.calculadoCentavos === envase.calculadoCentavos &&
      guardado !== envase.calculadoCentavos
    ) {
      montos[clave] = guardado;
    }
  }

  const guardadoTransporte = aPagarGuardado[CLAVE_TRANSPORTE];
  if (
    guardadoTransporte != null &&
    actual.transporte?.modo === "porcentaje" &&
    inicial.transporte?.modo === "porcentaje" &&
    actual.transporte.calculadoCentavos === inicial.transporte.calculadoCentavos
  ) {
    const conEnvases = calcularPedido({
      ...entradaActual,
      redondeos: redondeosPedidoDesdeMontos(montos),
    });
    if (conEnvases.transporte?.modo === "porcentaje" && guardadoTransporte !== conEnvases.transporte.calculadoCentavos) {
      montos[CLAVE_TRANSPORTE] = guardadoTransporte;
    }
  }

  return montos;
}

/** Un concepto pagable del pedido para "Registrar pago" y el detalle del
 * lote — armado desde `v_saldo_lote_concepto` (0038). */
export type ConceptoPagoLote = {
  /** `${concepto}:${producto_id ?? ""}` — única dentro del lote. */
  clave: string;
  concepto: ConceptoPago;
  productoId: string | null;
  presentacionMl: number | null;
  /** "Envasado 500 ml" / "Transporte" / "Otros del pedido". */
  etiqueta: string;
  aPagarCentavos: number;
  pagadoCentavos: number;
  pendienteCentavos: number;
};

const ORDEN_CONCEPTO_PAGO: Record<ConceptoPago, number> = { envase: 0, transporte: 1, otro: 2 };

/** Filas de `v_saldo_lote_concepto` → conceptos ordenados (envasado de la
 * presentación más grande primero, después transporte y otros). */
export function conceptosPagoLote(
  filas: {
    concepto: string | null;
    producto_id: string | null;
    a_pagar_centavos: number | null;
    pagado_centavos: number | null;
    saldo_centavos: number | null;
  }[],
  presentacionPorProducto: Map<string, number | null>,
): ConceptoPagoLote[] {
  return filas
    .flatMap((fila): ConceptoPagoLote[] => {
      const concepto = fila.concepto;
      if (concepto !== "envase" && concepto !== "transporte" && concepto !== "otro") return [];
      const presentacionMl = fila.producto_id
        ? (presentacionPorProducto.get(fila.producto_id) ?? null)
        : null;
      return [
        {
          clave: `${concepto}:${fila.producto_id ?? ""}`,
          concepto,
          productoId: fila.producto_id,
          presentacionMl,
          etiqueta: etiquetaConceptoPago(concepto, presentacionMl) ?? "Pago del pedido",
          aPagarCentavos: fila.a_pagar_centavos ?? 0,
          pagadoCentavos: fila.pagado_centavos ?? 0,
          pendienteCentavos: fila.saldo_centavos ?? 0,
        },
      ];
    })
    .sort(
      (a, b) =>
        ORDEN_CONCEPTO_PAGO[a.concepto] - ORDEN_CONCEPTO_PAGO[b.concepto] ||
        (b.presentacionMl ?? 0) - (a.presentacionMl ?? 0),
    );
}

/**
 * Monto con el que arranca cada concepto en "Registrar pago": su pendiente,
 * pero sin pasarse del pendiente TOTAL del pedido (un pedido con pagos
 * viejos sin concepto tiene menos pendiente total que la suma de sus
 * conceptos) — se reparte en orden, el que no alcanza queda en lo que sobra
 * o en 0.
 */
export function montosSugeridosPago(
  grupos: { clave: string; pendienteCentavos: number }[],
  pendienteTotalCentavos: number,
): Record<string, number> {
  let libre = Math.max(pendienteTotalCentavos, 0);
  const resultado: Record<string, number> = {};
  for (const grupo of grupos) {
    const monto = Math.min(Math.max(grupo.pendienteCentavos, 0), libre);
    resultado[grupo.clave] = monto;
    libre -= monto;
  }
  return resultado;
}


/** `detail` (crudo, del `using detail = json_build_object(...)::text` de
 * `fijar_costos_lote` § `COSTOS_MENORES_A_PAGADO`) parseado a números — o
 * `null` si `detail` falta o no tiene la forma esperada, para que
 * `mensajeErrorLote` caiga al mensaje genérico sin explotar. */
function detalleCostosMenoresAPagado(
  detalle: string | null | undefined,
): { pagadoCentavos: number; nuevoTotalCentavos: number; concepto: string | null } | null {
  if (!detalle) return null;
  try {
    const parsed = JSON.parse(detalle) as {
      pagado_centavos?: unknown;
      nuevo_total_centavos?: unknown;
      concepto?: unknown;
    };
    if (
      typeof parsed.pagado_centavos !== "number" ||
      typeof parsed.nuevo_total_centavos !== "number"
    ) {
      return null;
    }
    return {
      pagadoCentavos: parsed.pagado_centavos,
      nuevoTotalCentavos: parsed.nuevo_total_centavos,
      concepto: typeof parsed.concepto === "string" ? parsed.concepto : null,
    };
  } catch {
    return null;
  }
}

/** Concepto (0038) del `detail` de `PAGO_EXCEDE_SALDO`/`REDONDEO_INVALIDO`,
 * o `null` si no vino. */
function conceptoDelDetalle(detalle: string | null | undefined): string | null {
  if (!detalle) return null;
  try {
    const parsed = JSON.parse(detalle) as { concepto?: unknown };
    return typeof parsed.concepto === "string" ? parsed.concepto : null;
  } catch {
    return null;
  }
}

/** "del envasado" / "del transporte" / "de otros" — para los mensajes. */
function deConcepto(concepto: string | null): string {
  if (concepto === "envase") return "del envasado";
  if (concepto === "transporte") return "del transporte";
  if (concepto === "otro") return "de otros";
  return "de este concepto";
}

/** Mensajes en español de los errores de `registrar_pago_lote`/
 * `fijar_costos_lote`/`crear_lote` — compartido por `PagoLoteForm`,
 * `CostosLoteForm` y `LoteForm` (antes `LoteForm` tenía su propia copia
 * incompleta, sin los códigos de 0029 — ver `TRANSPORTE_AMBIGUO`/
 * `COSTO_ETIQUETA_*` abajo, que antes solo caían al mensaje genérico al
 * crear un lote nuevo). `detalle` es el `error.details` crudo del RPC
 * (Postgrest), usado solo por `COSTOS_MENORES_A_PAGADO` para nombrar los
 * montos exactos. */
export function mensajeErrorLote(
  codigo: string | undefined,
  detalle?: string | null,
): string {
  if (codigo === "NO_AUTORIZADO") {
    return "No tenés permiso para esto.";
  }
  if (codigo === "VENDEDOR_NO_REGISTRADO") {
    return "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.";
  }
  if (codigo === "LOTE_NO_ENCONTRADO") {
    return "Este lote ya no existe.";
  }
  if (codigo === "SIN_ITEMS") {
    return "Cargá al menos una cantidad.";
  }
  if (codigo === "CANTIDAD_INVALIDA") {
    return "Revisá las cantidades.";
  }
  if (codigo === "PRODUCTO_INVALIDO") {
    return "Faltan datos de los productos.";
  }
  if (codigo === "SIN_PAGOS") {
    return "Cargá al menos un medio de pago.";
  }
  if (codigo === "PAGO_INVALIDO") {
    const concepto = conceptoDelDetalle(detalle);
    return concepto
      ? `Este pedido no tiene nada para pagar ${deConcepto(concepto)}. Volvé al lote y revisá los costos.`
      : "Revisá los montos cargados.";
  }
  if (codigo === "PAGO_EXCEDE_SALDO") {
    const concepto = conceptoDelDetalle(detalle);
    return concepto
      ? `El pago ${deConcepto(concepto)} supera lo que falta pagar de ese concepto.`
      : "El pago supera lo que falta de este pedido.";
  }
  if (codigo === "REDONDEO_INVALIDO") {
    // Cubre varios casos (monto <= 0, envasado repetido o sin precio
    // cargado, redondeo de transporte sin transporte %): mensaje genérico.
    return "Revisá los montos reales (redondeos): cada uno tiene que ser mayor a cero y corresponder a un envasado con precio cargado o a un transporte en %.";
  }
  if (codigo === "CATEGORIA_PEDIDOS_FALTANTE") {
    return "Falta la categoría \"Pedidos de producción\".";
  }
  if (codigo === "COSTOS_INVALIDOS") {
    return "Cargá al menos un costo.";
  }
  if (codigo === "COSTO_ENVASE_INVALIDO") {
    return "Revisá el precio de envase cargado.";
  }
  if (codigo === "PRODUCTO_NO_EN_LOTE") {
    return "Esa presentación no forma parte de este lote.";
  }
  if (codigo === "COSTOS_MENORES_A_PAGADO") {
    const info = detalleCostosMenoresAPagado(detalle);
    if (info?.concepto) {
      return `No podés bajar lo a pagar ${deConcepto(info.concepto)} por debajo de lo que ya se pagó (ya se pagó ${formatCentavos(info.pagadoCentavos)} y quedaría ${formatCentavos(info.nuevoTotalCentavos)}). Revisá los pagos registrados.`;
    }
    if (info) {
      return `No podés bajar los costos por debajo de lo que ya se pagó de este pedido (ya se pagó ${formatCentavos(info.pagadoCentavos)} y el costo nuevo sería ${formatCentavos(info.nuevoTotalCentavos)}). Revisá los pagos registrados.`;
    }
    return "No podés bajar los costos por debajo de lo que ya se pagó de este pedido. Revisá los pagos registrados.";
  }
  if (codigo === "DEUDA_ACEITE_MENOR_A_PAGADO") {
    const info = detalleCostosMenoresAPagado(detalle);
    if (info) {
      return `No podés bajar la deuda con el proveedor de aceite por debajo de lo que ya se le pagó (ya se pagó ${formatMonto("USD", info.pagadoCentavos)} y quedaría ${formatMonto("USD", info.nuevoTotalCentavos)}). Revisá los pagos registrados en Deudas.`;
    }
    return "No podés bajar la deuda con el proveedor de aceite por debajo de lo que ya se le pagó. Revisá los pagos registrados en Deudas.";
  }
  if (codigo === "COSTO_ENVASE_DUPLICADO") {
    return "Cada presentación puede tener un solo precio de envase — revisá que no esté repetida.";
  }
  if (codigo === "COSTO_ETIQUETA_INVALIDO") {
    return "Revisá el precio o el envío de etiqueta cargado.";
  }
  if (codigo === "COSTO_ETIQUETA_DUPLICADO") {
    return "Cada insumo de etiqueta puede tener un solo precio — revisá que no esté repetido.";
  }
  if (codigo === "TRANSPORTE_AMBIGUO") {
    return "Elegí transporte como % o como monto fijo, no los dos a la vez.";
  }
  if (codigo === "COSTOS_ORIGINALES_INCOMPLETOS") {
    return "Este pedido todavía no tiene sus costos originales completos — primero completalos en \"Editar costos\".";
  }
  if (codigo === "COSTO_ANANJA_REDONDEADO_INVALIDO") {
    return "Revisá el costo Ananja redondeado: tiene que ser mayor a cero.";
  }
  if (codigo === "COSTO_ANANJA_REDONDEADO_DUPLICADO") {
    return "Cada presentación puede tener un solo costo Ananja redondeado — revisá que no esté repetida.";
  }
  return "No se pudo guardar. Probá de nuevo.";
}
