/**
 * "Se le deben a Ananja tantas botellas": cuántas botellas salieron del
 * depósito hacia las revendedoras y todavía no llegaron a Ananja en plata.
 * Una botella pasa por tres estados hasta que se cobra:
 *
 *  - A. En poder (`enPoder`): entregada, todavía no vendida ni devuelta.
 *    Sale tal cual de `stockRevendedorasPorLote` (`lote-en-manos.ts`).
 *  - B. Vendida sin pagar (`sinPagar`): la revendedora la vendió y todavía
 *    no pagó esa plata. Se calcula en pesos y se pasa a botellas (ver abajo).
 *  - C. Cobrada, sin pasar (`sinPasar`): la revendedora ya la pagó a su
 *    coordinadora y la coordinadora todavía no pasó esa plata a la Cuenta
 *    Ananja. Solo coordinadoras (`rol = 'coordinador'`).
 *
 * Total que se le debe a Ananja = A + B + C, abierto por producto.
 *
 * B — por revendedora, sus ventas ordenadas `(fecha, created_at, id)` forman
 * franjas en pesos (ancho = `cantidad × precio_costo_centavos`); todo lo que
 * rindió (TODAS las rendiciones, cualquier vía) cubre las franjas de la más
 * vieja a la más nueva. Lo que queda sin cubrir de cada venta, dividido por
 * su precio unitario, son las botellas sin pagar de esa venta. Si rindió de
 * más, B = 0.
 *
 * C — cada rendición `via = 'encargado'` ya trae su parte Ananja repartida
 * por lote (`repartirRendicionesPorLote`, `plata-por-lote.ts`, que es lo que
 * muestra "De qué lote es" en `/plata/en-manos/[id]`). Acá se abre ADEMÁS
 * por producto y costo Ananja unitario: cada tramo del recorrido
 * (`recorrerFranjasFifo`) viene de una venta puntual (producto, lote, costo),
 * y los centavos de cada lote se reparten entre los (producto, costo) de ese
 * lote en proporción a su parte Ananja exacta, con resto mayor, así que la
 * suma por lote es EXACTAMENTE la que ya muestra la pantalla de plata.
 * Los depósitos a la Cuenta Ananja se imputan igual que hoy (`imputarDepositos`:
 * sin lote primero, después del lote más viejo al más nuevo) y, dentro de un
 * mismo lote, se descuentan de los productos en un orden estable: nombre de
 * producto ascendente, desempate por id, y por último por costo Ananja
 * ascendente. Botellas = pesos pendientes de ese (lote, producto, costo) ÷
 * costo Ananja unitario. Lo que no se puede convertir a botellas (pesos sin
 * lote, excedente de pagos, ventas sin lote, "Otros movimientos", costo 0) y
 * la diferencia contra el total de la pantalla (`v_plata_en_manos`) queda en
 * pesos aparte: `sinBotella`. Si el total no es positivo no se muestra nada
 * de C, igual que el desglose por lote.
 *
 * Fracciones — un pago parcial deja una botella "a medio pagar". Una botella
 * que no está totalmente paga se cuenta como debida: al agrupar por
 * (persona, lote, producto) se suman las botellas exactas (fraccionarias) y
 * se redondea HACIA ARRIBA, salvo que lo que sobre sea ruido: si la
 * fracción sobrante vale como mucho `TOLERANCIA_CENTAVOS` (2 centavos, medidos
 * sobre el precio unitario MÁS BAJO del grupo), no cuenta como una botella
 * más. Ver `redondearBotellas`. Consecuencia conocida: una botella a medio
 * pagar a una coordinadora aparece en B (la parte que falta pagar) y en C
 * (la parte pagada que la coordinadora no pasó), porque cada grupo se
 * redondea por separado — se prefiere sobrecontar que olvidarse una botella.
 *
 * Consistencia entre B y C — B usa TODAS las rendiciones de la revendedora
 * (`v_deuda_vendedor`); C usa el recorrido de `v_rendiciones_ananja`, que
 * solo mira las de `via = 'encargado'`. En el caso normal (una revendedora
 * rinde siempre por la misma vía) cierran; si mezcla vías, los dos recorridos
 * son distintos y no se intentó unificarlos.
 *
 * Funciones puras, sin Supabase: la lectura vive en `lib/data/botellas-adeudadas.ts`.
 */

import type { EnManosFila } from "@/lib/dominio/lote-en-manos";
import { recorrerFranjasFifo } from "@/lib/dominio/plata";
import {
  imputarDepositos,
  recibidoPorLote,
  repartirEnterosRestoMayor,
  repartirRendicionesPorLote,
  type LoteFecha,
  type RendicionConParteAnanja,
  type VentaConLote,
} from "@/lib/dominio/plata-por-lote";

/** Error de redondeo que no inventa una botella: 2 centavos. */
export const TOLERANCIA_CENTAVOS = 2;

export type EstadoBotella = "enPoder" | "sinPagar" | "sinPasar";

export const ESTADOS_BOTELLA: EstadoBotella[] = ["enPoder", "sinPagar", "sinPasar"];

export interface ProductoRef {
  id: string;
  nombre: string;
  presentacionMl: number;
}

/** Una venta de revendedora con su producto: lo que necesitan B (precio
 * cobrado) y C (costo Ananja, lote). El orden del array es el de la vista
 * SQL (`fecha, created_at, id`) — ver `VentaCostoAnanjaRevendedor`. */
export interface VentaBotellas extends VentaConLote {
  productoId: string;
}

/** Botellas de un (estado, persona, lote, producto). `cantidad` es entera y > 0. */
export interface FilaBotellas {
  estado: EstadoBotella;
  /** Revendedora (A y B) o coordinadora que tiene la plata (C). */
  personaId: string;
  loteId: string | null;
  productoId: string;
  cantidad: number;
}

/**
 * Pasa botellas exactas (con decimales) a botellas enteras: hacia arriba,
 * pero un sobrante de hasta `TOLERANCIA_CENTAVOS` (medido con
 * `centavosPorBotella`) es ruido de redondeo y no suma una botella.
 */
export function redondearBotellas(exactas: number, centavosPorBotella: number): number {
  if (!(exactas > 0)) return 0;
  const tolerancia = centavosPorBotella > 0 ? TOLERANCIA_CENTAVOS / centavosPorBotella : 0;
  return Math.max(Math.ceil(exactas - tolerancia), 0);
}

interface Acumulado {
  exactas: number;
  /** Precio unitario más bajo del grupo (centavos por botella). */
  centavosMinimos: number;
}

function sumarExactas(grupos: Map<string, Acumulado>, clave: string, botellas: number, centavos: number): void {
  const previo = grupos.get(clave);
  if (previo) {
    previo.exactas += botellas;
    previo.centavosMinimos = Math.min(previo.centavosMinimos, centavos);
  } else {
    grupos.set(clave, { exactas: botellas, centavosMinimos: centavos });
  }
}

const SIN_LOTE = "-";
const claveLote = (loteId: string | null) => loteId ?? SIN_LOTE;
const desdeClaveLote = (clave: string) => (clave === SIN_LOTE ? null : clave);

// ------------------------------------------------------------------
// A. En poder
// ------------------------------------------------------------------

/** A: lo que sale de `stockRevendedorasPorLote` (ya en botellas enteras y > 0). */
export function filasEnPoder(enManos: EnManosFila[]): FilaBotellas[] {
  return enManos
    .filter((f) => f.enPoder > 0)
    .map((f) => ({
      estado: "enPoder",
      personaId: f.vendedorId,
      loteId: f.loteId,
      productoId: f.productoId,
      cantidad: f.enPoder,
    }));
}

// ------------------------------------------------------------------
// B. Vendidas sin pagar
// ------------------------------------------------------------------

/**
 * B: botellas vendidas cuya plata la revendedora todavía no rindió.
 * `ventas` tiene que venir ordenado `(fecha, created_at, id)`;
 * `rindioCentavosPorVendedor` es la suma de TODAS sus rendiciones. Agrupa
 * por (revendedora, lote, producto) y redondea hacia arriba con tolerancia.
 */
export function calcularSinPagar(
  ventas: VentaBotellas[],
  rindioCentavosPorVendedor: Map<string, number>,
): FilaBotellas[] {
  const sinCubrir = new Map(rindioCentavosPorVendedor);
  const grupos = new Map<string, Acumulado>();

  for (const v of ventas) {
    const ancho = v.cantidad * v.precioCostoCentavos;
    if (ancho <= 0 || v.precioCostoCentavos <= 0) continue;
    const disponible = Math.max(sinCubrir.get(v.vendedorId) ?? 0, 0);
    const cubierto = Math.min(disponible, ancho);
    sinCubrir.set(v.vendedorId, disponible - cubierto);

    const pesosSinPagar = ancho - cubierto;
    if (pesosSinPagar <= 0) continue;
    sumarExactas(
      grupos,
      `${v.vendedorId}|${claveLote(v.loteId)}|${v.productoId}`,
      pesosSinPagar / v.precioCostoCentavos,
      v.precioCostoCentavos,
    );
  }

  const filas: FilaBotellas[] = [];
  for (const [clave, g] of grupos) {
    const cantidad = redondearBotellas(g.exactas, g.centavosMinimos);
    if (cantidad <= 0) continue;
    const [personaId, lote, productoId] = clave.split("|");
    filas.push({ estado: "sinPagar", personaId, loteId: desdeClaveLote(lote), productoId, cantidad });
  }
  return filas;
}

// ------------------------------------------------------------------
// C. Cobradas por la coordinadora, sin pasar a Ananja
// ------------------------------------------------------------------

export interface CoordinadoraEntrada {
  id: string;
  /** Suma de `depositos_cuenta.monto_centavos` de la coordinadora. */
  depositosCentavos: number;
  /** El total grande de su pantalla (`v_plata_en_manos.total_centavos`). */
  totalCentavos: number;
}

export interface EntradaSinPasar {
  ventas: VentaBotellas[];
  /** `via = 'encargado'` de TODOS los tenedores (el recorrido es por revendedora), `created_at, id`. */
  rendiciones: RendicionConParteAnanja[];
  coordinadoras: CoordinadoraEntrada[];
  lotes: LoteFecha[];
  productos: ProductoRef[];
}

/** Pesos de una coordinadora que no se pudieron pasar a botellas (+ = a favor de Ananja). */
export interface SinBotella {
  coordinadoraId: string;
  centavos: number;
}

export interface ResultadoSinPasar {
  filas: FilaBotellas[];
  sinBotella: SinBotella[];
}

interface ClaveProducto {
  /** `null`: centavos de un lote que no se pudieron abrir por producto. */
  productoId: string | null;
  costoAnanjaCentavos: number;
  centavos: number;
}

/** Orden en que los depósitos se descuentan dentro de un lote: nombre de
 * producto asc, desempate por id, después costo Ananja asc; sin producto al final. */
function compararClaves(nombrePorProducto: Map<string, string>) {
  return (a: ClaveProducto, b: ClaveProducto): number => {
    if (a.productoId === null || b.productoId === null) {
      return a.productoId === b.productoId ? 0 : a.productoId === null ? 1 : -1;
    }
    const porNombre = (nombrePorProducto.get(a.productoId) ?? "").localeCompare(
      nombrePorProducto.get(b.productoId) ?? "",
      "es",
    );
    if (porNombre !== 0) return porNombre;
    if (a.productoId !== b.productoId) return a.productoId < b.productoId ? -1 : 1;
    return a.costoAnanjaCentavos - b.costoAnanjaCentavos;
  };
}

/**
 * C: abre por producto lo que cada coordinadora tiene que pasar a Ananja.
 * Ver el encabezado del módulo. El pendiente por lote (suma de los
 * (producto, costo) de ese lote) es exactamente el de `calcularLineasPorLote`.
 */
export function calcularSinPasar(entrada: EntradaSinPasar): ResultadoSinPasar {
  const { ventas, rendiciones, coordinadoras, lotes, productos } = entrada;
  const nombrePorProducto = new Map(productos.map((p) => [p.id, p.nombre]));
  const comparar = compararClaves(nombrePorProducto);
  const idsCoordinadoras = new Set(coordinadoras.map((c) => c.id));

  const repartos = repartirRendicionesPorLote(ventas, rendiciones);
  const recorridos = recorrerFranjasFifo(ventas, rendiciones);

  // tenedor -> lote -> "producto|costo" -> centavos recibidos
  const recibido = new Map<string, Map<string, Map<string, ClaveProducto>>>();
  rendiciones.forEach((r, i) => {
    if (!idsCoordinadoras.has(r.tenedorId)) return;
    for (const aporte of repartos[i].aportes) {
      if (aporte.loteId === null || aporte.centavos === 0) continue;

      const pesos = new Map<string, number>();
      const claves = new Map<string, ClaveProducto>();
      for (const tramo of recorridos[i].tramos) {
        const v = tramo.venta;
        if (!v || v.loteId !== aporte.loteId) continue;
        const clave = `${v.productoId}|${v.costoAnanjaCentavos}`;
        pesos.set(clave, (pesos.get(clave) ?? 0) + tramo.parteExacta);
        claves.set(clave, { productoId: v.productoId, costoAnanjaCentavos: v.costoAnanjaCentavos, centavos: 0 });
      }
      let reparto = repartirEnterosRestoMayor(aporte.centavos, pesos);
      if (reparto.size === 0) {
        // No se pudo abrir por producto (pesos en 0): queda entero sin producto.
        reparto = new Map([["", aporte.centavos]]);
        claves.set("", { productoId: null, costoAnanjaCentavos: 0, centavos: 0 });
      }

      const porLote = recibido.get(r.tenedorId) ?? new Map<string, Map<string, ClaveProducto>>();
      recibido.set(r.tenedorId, porLote);
      const porClave = porLote.get(aporte.loteId) ?? new Map<string, ClaveProducto>();
      porLote.set(aporte.loteId, porClave);
      for (const [clave, centavos] of reparto) {
        const previo = porClave.get(clave) ?? { ...claves.get(clave)!, centavos: 0 };
        previo.centavos += centavos;
        porClave.set(clave, previo);
      }
    }
  });

  const filas: FilaBotellas[] = [];
  const sinBotella: SinBotella[] = [];

  for (const c of coordinadoras) {
    // Igual que `armarDesglose`: sin total positivo no hay nada que mostrar.
    if (c.totalCentavos <= 0) continue;

    const lineas = imputarDepositos(recibidoPorLote(repartos, c.id), c.depositosCentavos, lotes);
    const grupos = new Map<string, Acumulado>();
    let pesosConvertidos = 0;

    for (const linea of lineas) {
      if (linea.loteId === null) continue; // "Sin lote asignado": todo va a sinBotella
      const porClave = recibido.get(c.id)?.get(linea.loteId);
      if (!porClave) continue;

      let porDescontar = Math.max(linea.pasadoCentavos, 0);
      for (const k of [...porClave.values()].sort(comparar)) {
        const pasado = Math.min(porDescontar, Math.max(k.centavos, 0));
        porDescontar -= pasado;
        const pendiente = k.centavos - pasado;
        if (pendiente <= 0 || k.productoId === null || k.costoAnanjaCentavos <= 0) continue;
        pesosConvertidos += pendiente;
        sumarExactas(
          grupos,
          `${linea.loteId}|${k.productoId}`,
          pendiente / k.costoAnanjaCentavos,
          k.costoAnanjaCentavos,
        );
      }
    }

    for (const [clave, g] of grupos) {
      const cantidad = redondearBotellas(g.exactas, g.centavosMinimos);
      if (cantidad <= 0) continue;
      const [loteId, productoId] = clave.split("|");
      filas.push({ estado: "sinPasar", personaId: c.id, loteId, productoId, cantidad });
    }

    const resto = c.totalCentavos - pesosConvertidos;
    if (resto !== 0) sinBotella.push({ coordinadoraId: c.id, centavos: resto });
  }

  return { filas, sinBotella };
}

// ------------------------------------------------------------------
// Agregaciones para la pantalla
// ------------------------------------------------------------------

export interface CantidadProducto {
  productoId: string;
  nombre: string;
  presentacionMl: number;
  cantidad: number;
}

export type Estados = Record<EstadoBotella, number>;

/** Un grupo de botellas (todas, de un lote o de una persona) con su abierto. */
export interface GrupoBotellas {
  total: number;
  productos: CantidadProducto[];
  estados: Estados;
}

export interface GrupoPorLote extends GrupoBotellas {
  loteId: string | null;
  /** "YYYY-MM-DD" del lote; `null` si no tiene lote o no se encontró. */
  fecha: string | null;
}

export interface GrupoPorPersona extends GrupoBotellas {
  personaId: string;
  nombre: string;
  esCoordinadora: boolean;
}

export interface LineaCoordinadora extends GrupoBotellas {
  personaId: string;
  nombre: string;
  /** Pesos de esa coordinadora que no se pudieron pasar a botellas. */
  sinBotellaCentavos: number;
}

export interface ResumenBotellas extends GrupoBotellas {
  /** Productos de cada estado (para las líneas "En poder", "Vendidas sin pagar"). */
  productosPorEstado: Record<EstadoBotella, CantidadProducto[]>;
  /** Una por coordinadora con botellas sin pasar o con pesos sin botella. */
  coordinadoras: LineaCoordinadora[];
  porLote: GrupoPorLote[];
  porPersona: GrupoPorPersona[];
}

export interface EntradaResumen {
  filas: FilaBotellas[];
  sinBotella: SinBotella[];
  productos: ProductoRef[];
  /** Nombre de cada persona (revendedoras y coordinadoras). */
  nombres: Map<string, string>;
  coordinadoraIds: Set<string>;
  lotes: LoteFecha[];
}

const estadosVacios = (): Estados => ({ enPoder: 0, sinPagar: 0, sinPasar: 0 });

interface Cuenta {
  total: number;
  estados: Estados;
  porProducto: Map<string, number>;
}

function nuevaCuenta(): Cuenta {
  return { total: 0, estados: estadosVacios(), porProducto: new Map() };
}

function sumarFila(c: Cuenta, f: FilaBotellas): void {
  c.total += f.cantidad;
  c.estados[f.estado] += f.cantidad;
  c.porProducto.set(f.productoId, (c.porProducto.get(f.productoId) ?? 0) + f.cantidad);
}

/** De la presentación más grande a la más chica; empate por nombre. */
function aProductos(porProducto: Map<string, number>, refs: Map<string, ProductoRef>): CantidadProducto[] {
  return [...porProducto]
    .filter(([, cantidad]) => cantidad > 0)
    .map(([productoId, cantidad]) => ({
      productoId,
      nombre: refs.get(productoId)?.nombre ?? "Producto",
      presentacionMl: refs.get(productoId)?.presentacionMl ?? 0,
      cantidad,
    }))
    .sort((a, b) => b.presentacionMl - a.presentacionMl || a.nombre.localeCompare(b.nombre, "es"));
}

function aGrupo(c: Cuenta, refs: Map<string, ProductoRef>): GrupoBotellas {
  return { total: c.total, productos: aProductos(c.porProducto, refs), estados: c.estados };
}

/** Totales general, por estado, por coordinadora, por lote y por persona. */
export function armarResumenBotellas(entrada: EntradaResumen): ResumenBotellas {
  const refs = new Map(entrada.productos.map((p) => [p.id, p]));
  const fechaPorLote = new Map(entrada.lotes.map((l) => [l.id, l.fecha]));

  const general = nuevaCuenta();
  const porEstado: Record<EstadoBotella, Map<string, number>> = {
    enPoder: new Map(),
    sinPagar: new Map(),
    sinPasar: new Map(),
  };
  const porLote = new Map<string, Cuenta>();
  const porPersona = new Map<string, Cuenta>();

  for (const f of entrada.filas) {
    if (f.cantidad <= 0) continue;
    sumarFila(general, f);
    porEstado[f.estado].set(f.productoId, (porEstado[f.estado].get(f.productoId) ?? 0) + f.cantidad);

    const lote = porLote.get(claveLote(f.loteId)) ?? nuevaCuenta();
    sumarFila(lote, f);
    porLote.set(claveLote(f.loteId), lote);

    const persona = porPersona.get(f.personaId) ?? nuevaCuenta();
    sumarFila(persona, f);
    porPersona.set(f.personaId, persona);
  }

  const nombreDe = (id: string) =>
    entrada.nombres.get(id) ?? (entrada.coordinadoraIds.has(id) ? "Coordinadora" : "Revendedora");

  const porLoteOrdenado: GrupoPorLote[] = [...porLote]
    .map(([clave, cuenta]) => {
      const loteId = desdeClaveLote(clave);
      return { loteId, fecha: loteId === null ? null : (fechaPorLote.get(loteId) ?? null), ...aGrupo(cuenta, refs) };
    })
    .sort((a, b) => {
      // Más viejo primero (así se descuentan los depósitos); sin lote o sin fecha, al final.
      if (a.fecha !== b.fecha) {
        if (a.fecha === null) return 1;
        if (b.fecha === null) return -1;
        return a.fecha < b.fecha ? -1 : 1;
      }
      return (a.loteId ?? "") < (b.loteId ?? "") ? -1 : (a.loteId ?? "") > (b.loteId ?? "") ? 1 : 0;
    });

  const porPersonaOrdenado: GrupoPorPersona[] = [...porPersona]
    .map(([personaId, cuenta]) => ({
      personaId,
      nombre: nombreDe(personaId),
      esCoordinadora: entrada.coordinadoraIds.has(personaId),
      ...aGrupo(cuenta, refs),
    }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));

  // Una línea por coordinadora con botellas sin pasar o con pesos sin botella.
  const sinBotellaPorCoordinadora = new Map(entrada.sinBotella.map((s) => [s.coordinadoraId, s.centavos]));
  const idsCoordinadoras = new Set<string>(sinBotellaPorCoordinadora.keys());
  for (const f of entrada.filas) if (f.estado === "sinPasar") idsCoordinadoras.add(f.personaId);
  const coordinadoras: LineaCoordinadora[] = [...idsCoordinadoras]
    .map((personaId) => {
      const cuenta = nuevaCuenta();
      for (const f of entrada.filas) if (f.estado === "sinPasar" && f.personaId === personaId) sumarFila(cuenta, f);
      return {
        personaId,
        nombre: nombreDe(personaId),
        sinBotellaCentavos: sinBotellaPorCoordinadora.get(personaId) ?? 0,
        ...aGrupo(cuenta, refs),
      };
    })
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));

  return {
    ...aGrupo(general, refs),
    productosPorEstado: {
      enPoder: aProductos(porEstado.enPoder, refs),
      sinPagar: aProductos(porEstado.sinPagar, refs),
      sinPasar: aProductos(porEstado.sinPasar, refs),
    },
    coordinadoras,
    porLote: porLoteOrdenado,
    porPersona: porPersonaOrdenado,
  };
}
