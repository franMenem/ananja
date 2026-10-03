/**
 * Cómo se nombra un gasto en Gastos, en su detalle y en los movimientos de
 * Caja: por lo que realmente fue (el insumo comprado, el concepto pagado del
 * pedido) cuando se sabe, y la categoría queda como dato secundario. También
 * el agrupado por mes de `/gastos` (rango de fechas para filtrar, rótulo de
 * grupo, total y categoría más pesada). Puro, sin Supabase — los callers
 * traen los datos con embeds (`movimientos_insumo(insumos(nombre))`,
 * `productos(presentacion_ml)`, `categorias_gasto(nombre)`) desde
 * `lib/data/gastos.ts`.
 */

import { NOMBRES_MES_MAYUS } from "@/lib/fechas";
import { formatPresentacion, NEGOCIO, type NegocioConfig } from "@/lib/negocio";
import { ERRORES_RPC_COMUNES, traducirErrorRpc } from "@/lib/dominio/errores-rpc";

/** `gastos.concepto_pago` (0038_pago_por_concepto.sql). */
export type ConceptoPago = "envase" | "transporte" | "otro";

/**
 * "Envasado 500 ml" / "Transporte" / "Otros del pedido" — `null` si no es
 * un pago de pedido con concepto (pagos anteriores a 0038, o cualquier otro
 * gasto). Un envase sin presentación conocida queda en "Envasado".
 */
export function etiquetaConceptoPago(
  concepto: string | null | undefined,
  presentacionMl: number | null | undefined,
  negocio: Pick<NegocioConfig, "unidad"> = NEGOCIO,
): string | null {
  if (concepto === "envase") {
    return presentacionMl != null
      ? `Envasado ${formatPresentacion(presentacionMl, negocio)}`
      : "Envasado";
  }
  if (concepto === "transporte") return "Transporte";
  if (concepto === "otro") return "Otros del pedido";
  return null;
}

/** Nombre del insumo comprado con este gasto (`registrar_compra_insumo`
 * crea un ingreso de `movimientos_insumo` con `gasto_id`) — el primero que
 * tenga nombre, o `null` si el gasto no es una compra de insumo. */
export function insumoDeMovimientos(
  movimientos: { insumos: { nombre: string } | null }[] | null | undefined,
): string | null {
  for (const m of movimientos ?? []) {
    if (m.insumos?.nombre) return m.insumos.nombre;
  }
  return null;
}

export interface GastoParaTitulo {
  categoriaNombre: string | null | undefined;
  conceptoPago: string | null | undefined;
  presentacionMl: number | null | undefined;
  insumoNombre: string | null | undefined;
}

export interface TituloGasto {
  titulo: string;
  /** La categoría, para mostrar como texto secundario — `null` cuando el
   * título YA es la categoría (no hace falta repetirla). */
  categoria: string | null;
}

/**
 * Precedencia: insumo comprado > concepto pagado del pedido > categoría
 * (lo de siempre). "Sin categoría" solo si no hay nada de nada.
 */
export function tituloGasto(
  gasto: GastoParaTitulo,
  negocio: Pick<NegocioConfig, "unidad"> = NEGOCIO,
): TituloGasto {
  const categoria = gasto.categoriaNombre ?? null;
  const conocido =
    gasto.insumoNombre || etiquetaConceptoPago(gasto.conceptoPago, gasto.presentacionMl, negocio);
  if (conocido) {
    return { titulo: conocido, categoria: categoria && categoria !== conocido ? categoria : null };
  }
  return { titulo: categoria ?? "Sin categoría", categoria: null };
}

/** Rango [inicio, fin) de un mes "AAAA-MM", para filtrar `gastos.fecha`
 * (`.gte(desde).lt(hasta)`) — evita el 31/30/28 de cada mes a mano. */
export function rangoDeMes(mes: string): { desde: string; hasta: string } {
  const [anio, mesNum] = mes.split("-").map(Number);
  const desde = `${mes}-01`;
  const hasta =
    mesNum === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mesNum + 1).padStart(2, "0")}-01`;
  return { desde, hasta };
}

export interface GastoParaAgrupar {
  fecha: string;
  monto_centavos: number;
  categorias_gasto: { nombre: string } | null;
}

/**
 * Encabezado de mes de un gasto para la lista agrupada del celular en
 * `/gastos` ("SEPTIEMBRE" si es el año en curso, "SEPTIEMBRE 2025" si no).
 * `ahora` es inyectable para tests; en la página es la fecha del propio
 * navegador (Client Component — no hace falta pasar por Argentina como en
 * un Server Component, ver `lib/fechas.ts`).
 */
export function mesLabelGasto(fecha: string, ahora: Date = new Date()): string {
  const [anio, mes] = fecha.split("-").map(Number);
  const nombre = NOMBRES_MES_MAYUS[mes - 1];
  return anio === ahora.getFullYear() ? nombre : `${nombre} ${anio}`;
}

/** Total del mes y la categoría que más pesa — bloque oliva de `/gastos`.
 * Sin categoría cuenta como "Sin categoría". */
export function resumenMesGastos(gastosDelMes: GastoParaAgrupar[]): {
  totalCentavos: number;
  categoriaMasPesada: string | null;
} {
  const totalCentavos = gastosDelMes.reduce((sum, g) => sum + g.monto_centavos, 0);

  const porCategoria = new Map<string, number>();
  for (const g of gastosDelMes) {
    const nombre = g.categorias_gasto?.nombre ?? "Sin categoría";
    porCategoria.set(nombre, (porCategoria.get(nombre) ?? 0) + g.monto_centavos);
  }
  let categoriaMasPesada: string | null = null;
  let max = 0;
  for (const [nombre, monto] of porCategoria) {
    if (monto > max) {
      max = monto;
      categoriaMasPesada = nombre;
    }
  }

  return { totalCentavos, categoriaMasPesada };
}

/** Agrupa gastos por mes (`mesLabelGasto`) preservando el orden de entrada
 * — la lista ya viene ordenada por fecha desc, así que un mismo mes queda
 * contiguo. Usado por la lista agrupada del celular en `/gastos`. */
export function agruparGastosPorMes<T extends GastoParaAgrupar>(
  gastos: T[],
  ahora: Date = new Date(),
): [string, T[]][] {
  const porMes = new Map<string, T[]>();
  for (const gasto of gastos) {
    const label = mesLabelGasto(gasto.fecha, ahora);
    const lista = porMes.get(label) ?? [];
    lista.push(gasto);
    porMes.set(label, lista);
  }
  return Array.from(porMes.entries());
}

/** Fila cruda de `listarFacturasDeGastos` (`lib/data/gastos.ts`): un gasto
 * con factura, sin agrupar todavía. */
export interface FacturaGastoRow {
  imagen_path: string | null;
  fecha: string;
  nota: string | null;
  categorias_gasto: { nombre: string } | null;
}

/** Una factura ya subida y reutilizable (agrupada por `imagen_path`), para
 * el selector "Usar una que ya subí" del detalle de un gasto. */
export interface FacturaGasto {
  imagenPath: string;
  /** La más reciente de los gastos que la usan. */
  fecha: string;
  categoriaNombre: string | null;
  nota: string | null;
  /** Cuántos gastos hoy tienen este mismo `imagen_path`. */
  cantidadGastos: number;
}

/**
 * Agrupa filas de gastos CON factura por `imagen_path` — una misma factura
 * puede cubrir más de un gasto (ej. una factura de etiquetas grandes cubre
 * "grande frente" Y "grande retro", ambos con el mismo `imagen_path`).
 * Espera las filas YA ordenadas por fecha desc (así las arma
 * `listarFacturasDeGastos`): la primera fila de cada grupo es la más
 * reciente y aporta `fecha`/`categoriaNombre`/`nota`; el resultado también
 * queda ordenado por esa fecha (orden de aparición del primer gasto de
 * cada grupo).
 */
export function agruparFacturasDeGastos(rows: FacturaGastoRow[]): FacturaGasto[] {
  const porPath = new Map<string, FacturaGasto>();
  for (const row of rows) {
    if (!row.imagen_path) continue;
    const existente = porPath.get(row.imagen_path);
    if (existente) {
      existente.cantidadGastos += 1;
      continue;
    }
    porPath.set(row.imagen_path, {
      imagenPath: row.imagen_path,
      fecha: row.fecha,
      categoriaNombre: row.categorias_gasto?.nombre ?? null,
      nota: row.nota,
      cantidadGastos: 1,
    });
  }
  return [...porPath.values()];
}

/** Errores de `adjuntar_comprobante_gasto`/`quitar_comprobante_gasto`
 * (`supabase/migrations/0067_comprobante_en_gastos.sql`) — sección
 * "Factura" del detalle de un gasto. */
const ERRORES_FACTURA_GASTO: Record<string, string> = {
  ...ERRORES_RPC_COMUNES,
  GASTO_NO_ENCONTRADO: "Este gasto ya no existe.",
  PATH_INVALIDO: "Ese archivo no es válido. Probá subiéndolo de nuevo.",
};

export function mensajeErrorFacturaGasto(codigo: string | undefined): string {
  return traducirErrorRpc(
    codigo,
    ERRORES_FACTURA_GASTO,
    "No pudimos guardar la factura. Probá de nuevo.",
  );
}
