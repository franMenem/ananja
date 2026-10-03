/**
 * Cálculo puro de "Tareas" — rediseño final (Inicio y Tareas, 2026-09-15).
 *
 * Una sola lista (sin grupos por sector, decisión de Fran), ordenada por
 * urgencia y después por antigüedad. Cada tarea lleva una etiqueta chica de
 * tipo ("Plata", "Pedido", …) y una urgencia:
 *  - `urgente`: hay que hacerlo ya (pago sin confirmar > 2 días, plata en
 *    mano > 7 días, deuda de revendedora con una venta impaga de más de
 *    60 días).
 *  - `normal`: hay que hacerlo, sin apuro.
 *  - `informativo`: para tener en cuenta (stock/insumos bajos, clientes con
 *    deuda, la plata en mano de otra persona). Aparece en la lista igual que
 *    las demás — el badge y el "N pendientes" de `/tareas` cuentan el TOTAL
 *    de tareas que la página lista, sin filtrar por urgencia (decisión de
 *    Fran 2026-09-21: antes el badge excluía las informativas y quedaba
 *    desincronizado del número que mostraba la propia página).
 *
 * A quién le toca cada tarea se decide acá (con `miVendedorId`), no en la
 * pantalla: "Confirmar pago" al encargado destinatario (o a cualquier admin
 * si fue a la Cuenta Ananja o si el encargado ya no está activo) — y
 * SIEMPRE a quien pagó, aunque el destinatario sea otro admin activo: desde
 * 2026-09-15 un admin puede confirmar (o rechazar) su propio pago, ver
 * `0046_admin_pago_propio.sql`; la plata en mano le toca a quien la tiene
 * ("Tenés $X en mano", cuenta para su badge) y los demás admins la ven como
 * aviso ("Laura tiene $X…", nunca cuenta para su badge, pedido de Fran
 * 2026-09-15); nunca se muestran las deudas propias.
 *
 * Sin Supabase: `lib/tareas-datos.ts` junta las fuentes y las pasa acá.
 */

import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { diasEntre, formatFecha } from "@/lib/fechas";
import { etiquetaConceptoPago } from "@/lib/dominio/gastos";
import { formatCentavos, formatMonto, parseMontoInput } from "@/lib/money";
import { concordar, envase, formatPresentacion, NEGOCIO } from "@/lib/negocio";

export type Urgencia = "urgente" | "normal" | "informativo";

export type TipoTarea =
  | "confirmar_pago_revendedor"
  | "confirmar_deposito_informado"
  | "plata_en_manos"
  | "pago_lote"
  | "deuda_negocio"
  | "deuda_vieja_revendedor"
  | "ventas_sin_precio"
  | "costos_incompletos"
  | "stock_bajo"
  | "insumo_bajo"
  | "clientes_deuda";

/** Rótulo chico de tipo que se muestra en cada tarea. */
export type EtiquetaTarea = "Plata" | "Pedido" | "Revendedora" | "Stock" | "Clientes" | "Deudas";

/** Acción de un toque desde la lista (BottomSheet). El resto de las tareas
 * son solo un link. Datos planos: viajan de un Server a un Client Component. */
export type AccionTarea =
  | {
      tipo: "confirmar_pago";
      pagoId: string;
      montoCentavos: number;
      medioPago: MedioPago;
      fecha: string;
      vendedorNombre: string;
      /** "A vos" / "A la cuenta de Ananja" / "A Laura (ya no está activa)". */
      destino: string;
      imagenPath: string | null;
      /** Signed URL del comprobante — la completa la página (server). */
      comprobanteUrl?: string | null;
    }
  | {
      tipo: "depositar";
      tenedorId: string;
      montoCentavos: number;
      /** Nombre de quien tiene la plata — `null` si es quien mira. */
      tenedorNombre: string | null;
    }
  | {
      tipo: "confirmar_deposito";
      depositoInformadoId: string;
      montoCentavos: number;
      medioPago: MedioPago;
      /** Quién avisó (el coordinador) — el depósito real, al confirmar,
       * queda a SU nombre (`tenedor_id`), nunca al del admin que confirma. */
      tenedorNombre: string;
    };

export interface Tarea {
  id: string;
  tipo: TipoTarea;
  etiqueta: EtiquetaTarea;
  urgencia: Urgencia;
  titulo: string;
  detalle: string;
  href: string;
  /** "yyyy-mm-dd" desde cuándo existe el pendiente — desempata el orden
   * (más viejo primero). */
  desde: string;
  montoCentavos?: number;
  accion?: AccionTarea;
}

// ─── Fuentes ────────────────────────────────────────────────────────────────

export interface PagoPorConfirmarTarea {
  pago_id: string;
  /** Quien pagó. Un admin puede confirmar (o rechazar) su propio pago
   * (0046_admin_pago_propio.sql); un revendedor que no es admin nunca llega
   * a esta lista (Tareas vive solo bajo `(app)`, fuera de su acceso). */
  vendedor_id: string;
  vendedor_nombre: string;
  monto_centavos: number;
  medio_pago: MedioPago;
  fecha: string;
  /** Día (Argentina) en que lo informó — desde ahí corre la espera. */
  informado_el: string;
  /** `null` = fue directo a la Cuenta Ananja. */
  destinatario_id: string | null;
  destinatario_nombre: string | null;
  /** El destinatario existe, está activo, y es admin o coordinador
   * (0055_coordinador.sql) — o sea, alguien a quien la plata le puede
   * quedar "en mano". `false` = destinatario dado de baja o sin rol
   * válido: cualquier admin puede resolver el pago (mismo criterio que
   * `confirmar_pago_revendedor`/`rechazar_pago_revendedor`). */
  destinatario_activo: boolean;
  /** El destinatario es un coordinador (no-admin) activo — nunca puede
   * confirmar/rechazar él mismo (esas funciones exigen `es_admin()`), así
   * que a diferencia de un destinatario admin, un pago dirigido a un
   * coordinador le toca a CUALQUIER admin, no solo a "ese mismo". */
  destinatario_es_coordinador: boolean;
  imagen_path: string | null;
}

export interface DepositoInformadoTarea {
  deposito_informado_id: string;
  /** El coordinador que avisó — el depósito real, al confirmar, queda a
   * SU nombre (nunca al del admin que confirma). */
  tenedor_id: string;
  tenedor_nombre: string;
  monto_centavos: number;
  medio_pago: MedioPago;
  /** Día (Argentina) en que lo avisó — desde ahí corre la espera. */
  informado_el: string;
}

export interface PlataEnManoTarea {
  tenedor_id: string;
  nombre: string;
  total_centavos: number;
  /** Admin activo: solo así `registrar_deposito_cuenta` acepta el depósito
   * (si no, la tarea sale sin botón). */
  activo: boolean;
  /** Fecha de la plata más vieja todavía sin pasar a la cuenta
   * (`fechaPlataEnManoMasVieja`), o `null` si no se pudo calcular. */
  desde: string | null;
}

export interface PedidoPorPagar {
  loteId: string;
  fecha: string;
  saldoCentavos: number;
  conceptos: { etiqueta: string; saldoCentavos: number }[];
}

export interface DeudaNegocioTarea {
  deuda_id: string;
  descripcion: string;
  fecha: string;
  moneda: "ARS" | "USD";
  restante_centavos: number;
}

/** Fila cruda de `v_saldo_deuda` para la tarea "Deudas" — a diferencia de
 * {@link DeudaNegocioTarea}, todavía trae `saldada_en` sin filtrar. */
export interface DeudaNegocioFila extends DeudaNegocioTarea {
  /** `null` = pendiente; una fecha = saldada (con o sin pago registrado). */
  saldada_en: string | null;
}

/**
 * Deudas del negocio que generan la tarea "Deudas": mismo criterio que
 * `listarDeudasPendientes` (`lib/deudas.ts`, bloque "Ananja debe" de
 * `/plata`) — `saldada_en IS NULL` — además de `restante_centavos > 0`.
 * Antes `cargarFuentesTareas` solo miraba `restante_centavos > 0`: una
 * deuda marcada saldada SIN pago registrado (`saldada_en` con fecha,
 * `restante_centavos` todavía en el monto completo — la vista
 * `v_saldo_deuda` no excluye las saldadas) generaba una tarea fantasma
 * pidiendo pagar una deuda que ya se había dado por resuelta.
 */
export function filtrarDeudasNegocioPendientes(filas: DeudaNegocioFila[]): DeudaNegocioTarea[] {
  return filas
    .filter((d) => d.saldada_en === null && d.restante_centavos > 0)
    .map(({ deuda_id, descripcion, fecha, moneda, restante_centavos }) => ({
      deuda_id,
      descripcion,
      fecha,
      moneda,
      restante_centavos,
    }));
}

export interface RevendedoraDeudaVieja {
  vendedor_id: string;
  nombre: string;
  saldo_centavos: number;
  /** Venta impaga más vieja (`fechaVentaImpagaMasVieja`). */
  venta_impaga_desde: string | null;
}

export interface RevendedoraSinPrecio {
  vendedor_id: string;
  nombre: string;
  unidades_sin_precio: number;
}

export interface LoteCostosIncompletos {
  loteId: string;
  fecha: string;
  faltantes: string[];
  /** Pedido de antes de 0028 (`esPedidoViejoSinCostos`): sale como
   * informativa "Pedido viejo sin costos" en vez de pedir cada costo. */
  viejo?: boolean;
}

export interface ItemBajo {
  nombre: string;
  bajo_umbral: boolean;
}

export interface ClienteConDeuda {
  cliente_id: string;
  deuda_centavos: number;
}

export interface CalcularTareasInput {
  hoy: string;
  miVendedorId: string | null;
  pagosPorConfirmar: PagoPorConfirmarTarea[];
  /** Depósitos que un coordinador avisó y todavía nadie confirmó/rechazó
   * (`depositos_informados`, 0057_coordinador_plata_stock.sql). */
  depositosInformados: DepositoInformadoTarea[];
  /** Todas las personas con plata en mano (`v_plata_en_manos`). */
  plataEnManos: PlataEnManoTarea[];
  pedidosPorPagar: PedidoPorPagar[];
  deudasNegocio: DeudaNegocioTarea[];
  revendedorasConDeuda: RevendedoraDeudaVieja[];
  revendedorasSinPrecio: RevendedoraSinPrecio[];
  lotesIncompletos: LoteCostosIncompletos[];
  stock: ItemBajo[];
  insumos: ItemBajo[];
  clientesConDeuda: ClienteConDeuda[];
}

// ─── Reglas (exportadas para tests) ────────────────────────────────────────

export const DIAS_PAGO_URGENTE = 2;
export const DIAS_PLATA_URGENTE = 7;
export const DIAS_DEUDA_VIEJA = 30;
export const DIAS_DEUDA_URGENTE = 60;

export { diasEntre };

function diasTexto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  return `hace ${dias} días`;
}

/**
 * FIFO de deuda de una revendedora: lo entregado (rendiciones) paga primero
 * las ventas más viejas. Devuelve la fecha de la venta más vieja que todavía
 * no quedó cubierta del todo, o `null` si está todo pago.
 */
export function fechaVentaImpagaMasVieja(
  ventas: { fecha: string; montoCentavos: number }[],
  entregadoCentavos: number,
): string | null {
  const ordenadas = [...ventas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acumulado = 0;
  for (const venta of ordenadas) {
    acumulado += venta.montoCentavos;
    if (acumulado > entregadoCentavos) return venta.fecha;
  }
  return null;
}

/**
 * Desde cuándo tiene alguien plata en mano sin pasar a la cuenta. FIFO: lo
 * que sale (depósitos, gastos, transferencias) usa primero la plata más
 * vieja, así que lo que queda en mano (`saldoCentavos`, de
 * `v_plata_en_manos`) son los ingresos MÁS NUEVOS. Se recorren los
 * ingresos (ventas/cobros en efectivo, rendiciones recibidas,
 * transferencias a efectivo) del más nuevo al más viejo hasta cubrir el
 * saldo: la fecha de ese ingreso es la de la plata más vieja en mano.
 *
 * Aproximación documentada: los ajustes de caja positivos no se cuentan
 * como ingreso; si los ingresos no alcanzan a cubrir el saldo (por un
 * ajuste), se toma la fecha del ingreso más viejo. `null` si no hay saldo
 * o no hay ingresos.
 */
export function fechaPlataEnManoMasVieja(
  ingresos: { fecha: string; montoCentavos: number }[],
  saldoCentavos: number,
): string | null {
  if (saldoCentavos <= 0 || ingresos.length === 0) return null;
  const ordenados = [...ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  let acumulado = 0;
  for (const ingreso of ordenados) {
    acumulado += ingreso.montoCentavos;
    if (acumulado >= saldoCentavos) return ingreso.fecha;
  }
  return ordenados[ordenados.length - 1].fecha;
}

export interface LoteCostosInput {
  loteId: string;
  fecha: string;
  dolarCentavos: number | null;
  precioLitroAceiteUsdCentavos: number | null;
  /** Productos que produjo el lote (`lote_items`). */
  productoIds: string[];
  costos: {
    concepto: string;
    productoId: string | null;
    costoUnitarioCentavos: number | null;
    totalCentavos: number;
  }[];
  /** Tiene gastos viejos asociados al lote (`gastos.lote_id` con
   * `concepto_lote is null`, de antes de 0028). */
  tieneGastosViejos: boolean;
}

/**
 * Regla de "pedido con costos incompletos" (qué falta cargar en
 * `/stock/lotes/[id]/costos`):
 *  - Aceite: falta si el lote no tiene dólar + precio del litro en USD, y
 *    tampoco una línea de aceite con precio en pesos (> 0).
 *  - Envase: falta por cada presentación producida que no tenga su línea
 *    de envase (una línea en $ 0 cuenta como cargada: puede ser a propósito).
 *  - Transporte: falta si no hay ninguna línea de transporte (según Fran,
 *    siempre hay transporte).
 * Devuelve lo que falta, en texto ("aceite", "envase 500 ml", "transporte").
 * Los pedidos viejos se separan antes con `esPedidoViejoSinCostos`.
 */
export function faltantesCostosLote(
  lote: LoteCostosInput,
  presentacionPorProducto: Map<string, number | null>,
): string[] {
  const faltantes: string[] = [];
  if (!aceiteCargado(lote)) faltantes.push("aceite");

  const productos = [...new Set(lote.productoIds)].sort(
    (a, b) => (presentacionPorProducto.get(b) ?? 0) - (presentacionPorProducto.get(a) ?? 0),
  );
  for (const productoId of productos) {
    if (!envaseCargado(lote, productoId)) {
      const ml = presentacionPorProducto.get(productoId);
      faltantes.push(ml != null ? `envase ${formatPresentacion(ml)}` : "envase");
    }
  }

  if (!transporteCargado(lote)) faltantes.push("transporte");
  return faltantes;
}

type CostosParaRegla = Pick<LoteCostosInput, "dolarCentavos" | "precioLitroAceiteUsdCentavos" | "costos">;

/** Aceite: dólar + USD por litro, o alguna línea de aceite con precio (> 0). */
function aceiteCargado(lote: CostosParaRegla): boolean {
  const aceiteEnUsd = (lote.dolarCentavos ?? 0) > 0 && (lote.precioLitroAceiteUsdCentavos ?? 0) > 0;
  const aceiteEnPesos = lote.costos.some(
    (c) => c.concepto === "aceite" && ((c.totalCentavos ?? 0) > 0 || (c.costoUnitarioCentavos ?? 0) > 0),
  );
  return aceiteEnUsd || aceiteEnPesos;
}

/** Línea de envase de esa presentación (una en $ 0 cuenta como cargada). */
function envaseCargado(lote: CostosParaRegla, productoId: string): boolean {
  return lote.costos.some((c) => c.concepto === "envase" && c.productoId === productoId);
}

/** Alguna línea de transporte. */
function transporteCargado(lote: CostosParaRegla): boolean {
  return lote.costos.some((c) => c.concepto === "transporte");
}

/** Pedido de antes del cálculo de costos por pedido (0028): ninguna línea
 * en `lote_costos` pero con gastos viejos del lote. No se le pide cada
 * costo como tarea normal (sale como informativa). */
export function esPedidoViejoSinCostos(lote: LoteCostosInput): boolean {
  return lote.costos.length === 0 && lote.tieneGastosViejos;
}

/** "a", "a y b", "a, b y c". */
function listaConY(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Pedidos al proveedor con saldo por pagar, con sus conceptos pendientes. El
 * total manda `v_saldo_lote` (descuenta también pagos viejos sin concepto);
 * los conceptos salen de `v_saldo_lote_concepto`.
 */
export function agruparPedidosPorPagar(
  saldosLote: { lote_id: string; fecha: string; saldo_centavos: number }[],
  saldosConcepto: { lote_id: string; concepto: string; producto_id: string | null; saldo_centavos: number }[],
  presentacionPorProducto: Map<string, number | null>,
): PedidoPorPagar[] {
  return saldosLote
    .filter((l) => l.saldo_centavos > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((l) => ({
      loteId: l.lote_id,
      fecha: l.fecha,
      saldoCentavos: l.saldo_centavos,
      conceptos: saldosConcepto
        .filter((c) => c.lote_id === l.lote_id && c.saldo_centavos > 0)
        .map((c) => ({
          etiqueta:
            etiquetaConceptoPago(
              c.concepto,
              c.producto_id ? (presentacionPorProducto.get(c.producto_id) ?? null) : null,
            ) ?? "Pago del pedido",
          saldoCentavos: c.saldo_centavos,
        })),
    }));
}

// ─── Armado de cada tipo ───────────────────────────────────────────────────

function tareasPagos(pagos: PagoPorConfirmarTarea[], miVendedorId: string | null, hoy: string): Tarea[] {
  return pagos
    .filter(
      (p) =>
        // Es mi propio pago (puedo confirmarlo o rechazarlo yo mismo,
        // 0046_admin_pago_propio.sql), o me toca por destinatario. Un
        // destinatario coordinador (0055) nunca "le toca a uno en
        // particular": como nunca puede resolverlo él mismo, le toca a
        // CUALQUIER admin — mismo criterio que un destinatario inactivo.
        (miVendedorId !== null && p.vendedor_id === miVendedorId) ||
        p.destinatario_id === null ||
        !p.destinatario_activo ||
        p.destinatario_es_coordinador ||
        (miVendedorId !== null && p.destinatario_id === miVendedorId),
    )
    .map((p) => {
      const dias = diasEntre(p.informado_el, hoy);
      const destino =
        p.destinatario_id === null
          ? `A la cuenta de ${NEGOCIO.nombre}`
          : p.destinatario_id === miVendedorId
            ? "A vos"
            : p.destinatario_activo
              ? `A ${p.destinatario_nombre ?? "su encargado"}`
              : `A ${p.destinatario_nombre ?? "su encargado"} (ya no está activo)`;
      return {
        id: `confirmar-pago-${p.pago_id}`,
        tipo: "confirmar_pago_revendedor" as const,
        etiqueta: "Revendedora" as const,
        urgencia: dias > DIAS_PAGO_URGENTE ? ("urgente" as const) : ("normal" as const),
        titulo: `Confirmar ${formatCentavos(p.monto_centavos)} que pagó ${p.vendedor_nombre}`,
        detalle: `${MEDIO_PAGO_LABELS[p.medio_pago]} · ${formatFecha(p.fecha)} · informado ${diasTexto(dias)}`,
        href: `/tareas/pagos/${p.pago_id}`,
        desde: p.informado_el,
        montoCentavos: p.monto_centavos,
        accion: {
          tipo: "confirmar_pago" as const,
          pagoId: p.pago_id,
          montoCentavos: p.monto_centavos,
          medioPago: p.medio_pago,
          fecha: p.fecha,
          vendedorNombre: p.vendedor_nombre,
          destino,
          imagenPath: p.imagen_path,
        },
      };
    });
}

/**
 * "Confirmar" de un depósito que un coordinador avisó
 * (0057_coordinador_plata_stock.sql) — a diferencia de un pago de
 * revendedora, acá no hay destinatario ni variación de a quién le toca:
 * como siempre va "a la Cuenta Ananja", le toca a CUALQUIER admin (mismo
 * criterio que un pago sin destinatario, `p.destinatario_id === null` en
 * `tareasPagos`). Urgente a partir de los mismos `DIAS_PAGO_URGENTE` días.
 */
function tareasDepositosInformados(depositos: DepositoInformadoTarea[], hoy: string): Tarea[] {
  return depositos.map((d) => {
    const dias = diasEntre(d.informado_el, hoy);
    return {
      id: `confirmar-deposito-${d.deposito_informado_id}`,
      tipo: "confirmar_deposito_informado" as const,
      etiqueta: "Plata" as const,
      urgencia: dias > DIAS_PAGO_URGENTE ? ("urgente" as const) : ("normal" as const),
      titulo: `Confirmar ${formatCentavos(d.monto_centavos)} que pasó ${d.tenedor_nombre}`,
      detalle: `${MEDIO_PAGO_LABELS[d.medio_pago]} · informado ${diasTexto(dias)}`,
      href: "/tareas",
      desde: d.informado_el,
      montoCentavos: d.monto_centavos,
      accion: {
        tipo: "confirmar_deposito" as const,
        depositoInformadoId: d.deposito_informado_id,
        montoCentavos: d.monto_centavos,
        medioPago: d.medio_pago,
        tenedorNombre: d.tenedor_nombre,
      },
    };
  });
}

function tareasPlataEnManos(plata: PlataEnManoTarea[], miVendedorId: string | null, hoy: string): Tarea[] {
  return plata.flatMap((p): Tarea[] => {
    if (p.total_centavos <= 0) return [];
    const propia = miVendedorId !== null && p.tenedor_id === miVendedorId;
    const dias = p.desde ? diasEntre(p.desde, hoy) : null;
    const vieja = dias !== null && dias > DIAS_PLATA_URGENTE;
    const accion: AccionTarea | undefined =
      propia || p.activo
        ? {
            tipo: "depositar",
            tenedorId: p.tenedor_id,
            montoCentavos: p.total_centavos,
            tenedorNombre: propia ? null : p.nombre,
          }
        : undefined;

    if (propia) {
      return [
        {
          id: `plata-en-manos-${p.tenedor_id}`,
          tipo: "plata_en_manos",
          etiqueta: "Plata",
          urgencia: vieja ? "urgente" : "normal",
          titulo: `Tenés ${formatCentavos(p.total_centavos)} en mano para pasar a la cuenta`,
          detalle:
            dias === null
              ? `Pasala a la cuenta de ${NEGOCIO.nombre}.`
              : dias <= 0
                ? "La plata más vieja entró hoy."
                : `La plata más vieja la tenés desde ${diasTexto(dias)}.`,
          href: `/plata/depositar?tenedor=${p.tenedor_id}&monto=${p.total_centavos}`,
          desde: p.desde ?? hoy,
          montoCentavos: p.total_centavos,
          accion,
        },
      ];
    }

    // Plata de otra persona: aviso para el resto de los admins (en la
    // práctica Fran registra el depósito). Nunca urgente para quien no la
    // tiene, pero SÍ cuenta en el total del badge (igual que en la lista).
    return [
      {
        id: `plata-en-manos-${p.tenedor_id}`,
        tipo: "plata_en_manos",
        etiqueta: "Plata",
        urgencia: vieja ? "normal" : "informativo",
        titulo: `${p.nombre} tiene ${formatCentavos(p.total_centavos)} para pasar a la cuenta`,
        detalle:
          dias === null
            ? `Todavía no la pasó a la cuenta de ${NEGOCIO.nombre}.`
            : dias <= 0
              ? "La plata más vieja entró hoy."
              : `La plata más vieja la tiene desde ${diasTexto(dias)}.`,
        href: "/plata",
        desde: p.desde ?? hoy,
        montoCentavos: p.total_centavos,
        accion,
      },
    ];
  });
}

function tareasPedidos(pedidos: PedidoPorPagar[]): Tarea[] {
  return pedidos
    .filter((p) => p.saldoCentavos > 0)
    .map((p) => ({
      id: `pago-lote-${p.loteId}`,
      tipo: "pago_lote" as const,
      etiqueta: "Pedido" as const,
      urgencia: "normal" as const,
      titulo: `Pagar pedido del ${formatFecha(p.fecha)}: faltan ${formatCentavos(p.saldoCentavos)}`,
      detalle:
        p.conceptos.length > 0
          ? p.conceptos.map((c) => `${c.etiqueta} ${formatCentavos(c.saldoCentavos)}`).join(" · ")
          : "Pago del pedido.",
      href: `/stock/lotes/${p.loteId}/pago`,
      desde: p.fecha,
      montoCentavos: p.saldoCentavos,
    }));
}

function tareasDeudasNegocio(deudas: DeudaNegocioTarea[]): Tarea[] {
  return deudas
    .filter((d) => d.restante_centavos > 0)
    .map((d) => ({
      id: `deuda-negocio-${d.deuda_id}`,
      tipo: "deuda_negocio" as const,
      etiqueta: "Deudas" as const,
      urgencia: "normal" as const,
      titulo: `Deuda pendiente: ${d.descripcion}`,
      detalle: `Faltan ${formatMonto(d.moneda, d.restante_centavos)} · desde ${formatFecha(d.fecha)}`,
      href: "/plata/deudas",
      desde: d.fecha,
      montoCentavos: d.restante_centavos,
    }));
}

function tareasDeudaVieja(revendedoras: RevendedoraDeudaVieja[], miVendedorId: string | null, hoy: string): Tarea[] {
  return revendedoras.flatMap((r) => {
    if (r.vendedor_id === miVendedorId || r.saldo_centavos <= 0 || !r.venta_impaga_desde) return [];
    const dias = diasEntre(r.venta_impaga_desde, hoy);
    if (dias <= DIAS_DEUDA_VIEJA) return [];
    return [
      {
        id: `deuda-vieja-${r.vendedor_id}`,
        tipo: "deuda_vieja_revendedor" as const,
        etiqueta: "Revendedora" as const,
        urgencia: dias > DIAS_DEUDA_URGENTE ? ("urgente" as const) : ("normal" as const),
        titulo: `${r.nombre} debe ${formatCentavos(r.saldo_centavos)} desde hace ${dias} días`,
        detalle: `La venta sin pagar más vieja es del ${formatFecha(r.venta_impaga_desde)}.`,
        href: `/revendedores/${r.vendedor_id}`,
        desde: r.venta_impaga_desde,
        montoCentavos: r.saldo_centavos,
      },
    ];
  });
}

function tareasSinPrecio(revendedoras: RevendedoraSinPrecio[], miVendedorId: string | null, hoy: string): Tarea[] {
  return revendedoras
    .filter((r) => r.vendedor_id !== miVendedorId && r.unidades_sin_precio > 0)
    .map((r) => ({
      id: `sin-precio-${r.vendedor_id}`,
      tipo: "ventas_sin_precio" as const,
      etiqueta: "Revendedora" as const,
      urgencia: "normal" as const,
      titulo: `${r.nombre} tiene ${r.unidades_sin_precio} ${envase(r.unidades_sin_precio)} ${concordar("vendidos", "vendidas")} sin precio`,
      detalle: "Cargá a cuánto las vendió para calcular su ganancia.",
      href: `/revendedores/${r.vendedor_id}`,
      desde: hoy,
    }));
}

function tareasCostosIncompletos(lotes: LoteCostosIncompletos[]): Tarea[] {
  return lotes
    .filter((l) => l.viejo || l.faltantes.length > 0)
    .map((l) =>
      l.viejo
        ? {
            id: `pedido-viejo-${l.loteId}`,
            tipo: "costos_incompletos" as const,
            etiqueta: "Pedido" as const,
            urgencia: "informativo" as const,
            titulo: `Pedido viejo sin costos: del ${formatFecha(l.fecha)}`,
            detalle: "Es de antes de cargar costos por pedido. Cargalos si querés ver su ganancia real.",
            href: `/stock/lotes/${l.loteId}/costos`,
            desde: l.fecha,
          }
        : {
            id: `costos-incompletos-${l.loteId}`,
            tipo: "costos_incompletos" as const,
            etiqueta: "Pedido" as const,
            urgencia: "normal" as const,
            titulo: `Completar costos del pedido del ${formatFecha(l.fecha)}`,
            detalle: `Falta cargar ${listaConY(l.faltantes.map((f) => `el ${f}`))}.`,
            href: `/stock/lotes/${l.loteId}/costos`,
            desde: l.fecha,
          },
    );
}

function nombresCortos(nombres: string[], max = 3): string {
  if (nombres.length <= max) return nombres.join(", ");
  return `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más`;
}

function tareaStockBajo(stock: ItemBajo[], hoy: string): Tarea[] {
  const bajos = stock.filter((s) => s.bajo_umbral);
  if (bajos.length === 0) return [];
  return [
    {
      id: "stock-bajo",
      tipo: "stock_bajo",
      etiqueta: "Stock",
      urgencia: "informativo",
      titulo: `Stock bajo: ${nombresCortos(bajos.map((b) => b.nombre))}`,
      detalle: "Por debajo del mínimo.",
      href: "/stock",
      desde: hoy,
    },
  ];
}

function tareaInsumoBajo(insumos: ItemBajo[], hoy: string): Tarea[] {
  const bajos = insumos.filter((i) => i.bajo_umbral);
  if (bajos.length === 0) return [];
  return [
    {
      id: "insumo-bajo",
      tipo: "insumo_bajo",
      etiqueta: "Stock",
      urgencia: "informativo",
      titulo: `Insumos bajos: ${nombresCortos(bajos.map((b) => b.nombre))}`,
      detalle: "Por debajo del mínimo.",
      href: "/stock/insumos",
      desde: hoy,
    },
  ];
}

function tareaClientes(clientes: ClienteConDeuda[], hoy: string): Tarea[] {
  const deudores = clientes.filter((c) => c.deuda_centavos > 0);
  if (deudores.length === 0) return [];
  const total = deudores.reduce((acc, c) => acc + c.deuda_centavos, 0);
  return [
    {
      id: "clientes-deuda",
      tipo: "clientes_deuda",
      etiqueta: "Clientes",
      urgencia: "informativo",
      titulo: `${deudores.length} ${deudores.length === 1 ? "cliente debe" : "clientes deben"} ${formatCentavos(total)}`,
      detalle: "Registrá los cobros desde la ficha de cada cliente.",
      href: "/clientes",
      desde: hoy,
      montoCentavos: total,
    },
  ];
}

const RANGO_URGENCIA: Record<Urgencia, number> = { urgente: 0, normal: 1, informativo: 2 };

/** Urgencia primero; dentro de la misma, lo más viejo arriba. */
export function ordenarTareas(tareas: Tarea[]): Tarea[] {
  return [...tareas].sort(
    (a, b) =>
      RANGO_URGENCIA[a.urgencia] - RANGO_URGENCIA[b.urgencia] ||
      a.desde.localeCompare(b.desde) ||
      a.titulo.localeCompare(b.titulo),
  );
}

export function calcularTareas(input: CalcularTareasInput): Tarea[] {
  const { hoy, miVendedorId } = input;
  return ordenarTareas([
    ...tareasPagos(input.pagosPorConfirmar, miVendedorId, hoy),
    ...tareasDepositosInformados(input.depositosInformados, hoy),
    ...tareasPlataEnManos(input.plataEnManos, miVendedorId, hoy),
    ...tareasPedidos(input.pedidosPorPagar),
    ...tareasDeudasNegocio(input.deudasNegocio),
    ...tareasDeudaVieja(input.revendedorasConDeuda, miVendedorId, hoy),
    ...tareasSinPrecio(input.revendedorasSinPrecio, miVendedorId, hoy),
    ...tareasCostosIncompletos(input.lotesIncompletos),
    ...tareaStockBajo(input.stock, hoy),
    ...tareaInsumoBajo(input.insumos, hoy),
    ...tareaClientes(input.clientesConDeuda, hoy),
  ]);
}

/**
 * Fuente ÚNICA del número de "pendientes": el total de tareas que le tocan
 * a quien mira, el MISMO que lista `/tareas` — usada por la propia página
 * (`app/(app)/tareas/page.tsx`), el badge (`app/api/tareas-count/route.ts`)
 * e Inicio (`lib/inicio-datos.ts`). Decisión de Fran (2026-09-21): antes el
 * badge excluía las informativas y la plata en mano de otra persona, y
 * terminaba mostrando un número distinto al de la propia pantalla — ahora
 * los tres lugares cuentan lo mismo. Los "Avisos" (notificaciones,
 * `lib/notificaciones.ts`) no son tareas y nunca se cuentan acá.
 */
export function contarTareasPendientes(tareas: Tarea[]): number {
  return tareas.length;
}

export type ValidacionMontoDeposito =
  | { tipo: "ok"; centavos: number }
  | { tipo: "invalido" }
  | { tipo: "excede"; centavos: number; disponibleCentavos: number };

/**
 * Monto escrito en "Pasar a la cuenta" de un toque (precargado con lo que
 * tiene en mano, editable): tiene que ser > 0 y, salvo que se elija
 * "Guardar igual", no mayor a lo disponible — si lo supera se ofrece "Usar
 * $ disponible" o "Guardar igual" sin llamar al RPC (que igual lo vuelve a
 * chequear con el saldo del momento: `SALDO_INSUFICIENTE`).
 */
export function validarMontoDeposito(
  texto: string,
  disponibleCentavos: number,
  permitirNegativo = false,
): ValidacionMontoDeposito {
  const centavos = parseMontoInput(texto);
  if (centavos === null || centavos <= 0) return { tipo: "invalido" };
  if (!permitirNegativo && centavos > disponibleCentavos) {
    return { tipo: "excede", centavos, disponibleCentavos };
  }
  return { tipo: "ok", centavos };
}
