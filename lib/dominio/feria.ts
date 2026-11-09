/**
 * Feria de revendedoras — cálculos puros (sin Supabase ni React).
 *
 * El admin arma la feria y le carga a cada revendedora las botellas que se
 * lleva. Al final ella cierra su parte diciendo, por producto, cuántas
 * devuelve y cuántas se usaron para degustar; lo que falta se considera
 * vendido: `vendidas = llevadas - ya vendidas - devueltas - degustadas` (las
 * "ya vendidas" son ventas normales cargadas antes del cierre). La base hace el
 * mismo cálculo dentro de `feria_cerrar_participacion` (migración 0078);
 * esto es el espejo para mostrar el resumen ANTES de guardar.
 */

import { ERRORES_RPC_COMUNES, traducirErrorRpc } from "@/lib/dominio/errores-rpc";

export type MedioFeria = "efectivo" | "mercado_pago" | "banco";

export type ProductoCierreFeria = {
  productoId: string;
  nombre: string;
  /** Botellas que se llevó a la feria (suma de sus entregas de feria). */
  entregadas: number;
  /** Botellas de la feria que ya vendió por el flujo normal antes del cierre
   * (ventas atribuidas por FIFO a sus entregas de feria). Default 0. */
  yaVendidas?: number;
  /** Precio de feria fijado por el admin; `null` si no tiene. */
  precioCentavos: number | null;
};

export type FilaCierreFeria = {
  productoId: string;
  nombre: string;
  entregadas: number;
  /** Ya vendidas antes del cierre (no se vuelven a vender). */
  yaVendidas: number;
  devueltas: number;
  degustadas: number;
  /** Vendidas NUEVAS de este cierre (sin las `yaVendidas`). */
  vendidas: number;
  /** Precio con el que se vende: el corregido por ella o el de la feria. */
  precioCentavos: number | null;
  subtotalCentavos: number;
};

export type CierreFeria = {
  filas: FilaCierreFeria[];
  totalCentavos: number;
  errores: string[];
};

function cantidadValida(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/**
 * Resumen del cierre de una participación. `devueltas`/`degustadas` son
 * `productoId -> cantidad` (faltante = 0). `precios` son los precios
 * corregidos por la revendedora (`productoId -> centavos`; `null`/ausente =
 * se usa el de la feria). No lanza: los problemas salen en `errores`, en
 * español, para mostrarlos tal cual.
 */
export function calcularCierreFeria(
  productos: ProductoCierreFeria[],
  devueltas: Record<string, number>,
  degustadas: Record<string, number>,
  precios: Record<string, number | null>,
): CierreFeria {
  const errores: string[] = [];
  const filas: FilaCierreFeria[] = [];
  let totalCentavos = 0;

  for (const p of productos) {
    const dev = devueltas[p.productoId] ?? 0;
    const deg = degustadas[p.productoId] ?? 0;

    if (!cantidadValida(dev) || !cantidadValida(deg)) {
      errores.push(`Revisá las cantidades de ${p.nombre}.`);
    }

    const ya = p.yaVendidas ?? 0;
    const vendidas = p.entregadas - ya - dev - deg;
    if (vendidas < 0) {
      errores.push(`Devolviste o degustaste más ${p.nombre} de las que te llevaste.`);
    }

    const corregido = precios[p.productoId];
    const precioCentavos = corregido != null ? corregido : p.precioCentavos;

    if (vendidas > 0 && (precioCentavos == null || precioCentavos <= 0)) {
      errores.push(`Falta el precio de ${p.nombre}.`);
    }

    const subtotalCentavos =
      vendidas > 0 && precioCentavos != null && precioCentavos > 0 ? vendidas * precioCentavos : 0;
    totalCentavos += subtotalCentavos;

    filas.push({
      productoId: p.productoId,
      nombre: p.nombre,
      entregadas: p.entregadas,
      yaVendidas: ya,
      devueltas: dev,
      degustadas: deg,
      vendidas,
      precioCentavos,
      subtotalCentavos,
    });
  }

  return { filas, totalCentavos, errores };
}

/**
 * Medio de pago que se le pone a las ventas: el de la plata si exactamente un
 * monto es mayor a cero; con dos o más (o ninguno), `null` (mismo criterio
 * que `feria_cerrar_participacion`).
 */
export function medioDeMontos(
  efectivoCentavos: number,
  mercadoPagoCentavos: number,
  bancoCentavos: number,
): MedioFeria | null {
  const con: MedioFeria[] = [];
  if (efectivoCentavos > 0) con.push("efectivo");
  if (mercadoPagoCentavos > 0) con.push("mercado_pago");
  if (bancoCentavos > 0) con.push("banco");
  return con.length === 1 ? con[0] : null;
}

/**
 * Cuánto se juntó de más o de menos respecto de lo vendido:
 * `cobrado - total`. Positivo = sobra plata, negativo = falta, 0 = cuadra.
 */
export function diferenciaPlata(totalCentavos: number, cobradoCentavos: number): number {
  return cobradoCentavos - totalCentavos;
}

/** Errores de las funciones de feria (0078), código -> mensaje. */
export const ERRORES_FERIA: Record<string, string> = {
  ...ERRORES_RPC_COMUNES,
  FERIA_CERRADA: "Esta feria ya está cerrada.",
  FERIA_NO_ENCONTRADA: "No encontramos esa feria.",
  PARTICIPACION_CERRADA: "Ya cerraste tu participación en esta feria.",
  PARTICIPANTE_NO_ENCONTRADO: "Esa persona no participa de esta feria.",
  PARTICIPANTES_PENDIENTES: "Todavía hay participantes sin cerrar.",
  PARTICIPANTE_CON_MOVIMIENTOS:
    "Esa persona ya tiene botellas o ventas en esta feria, no se la puede sacar.",
  VENTA_DE_FERIA:
    "Esta venta es de una feria. Si hay que corregirla, pedile a un admin que reabra tu participación.",
  VENTA_CON_RENDICION: "Una de esas ventas ya generó una rendición. Corregí la rendición primero.",
  CANTIDAD_INVALIDA: "Estás devolviendo más de lo que se llevó.",
  PRECIO_NO_ASIGNADO: "Falta el precio de feria de un producto.",
  PRECIO_INVALIDO: "Revisá los precios: tienen que ser mayores a cero.",
  NOMBRE_INVALIDO: "Poné un nombre para la feria.",
  FECHA_INVALIDA: "Revisá la fecha.",
  FECHA_FUTURA: "La fecha no puede ser posterior a hoy.",
  FECHA_ANTERIOR_A_ENTREGA:
    "La fecha es anterior a la entrega de esas botellas. Revisá la fecha.",
  MONTO_INVALIDO: "Revisá la plata que juntaste: no puede ser negativa.",
  REVENDEDOR_INVALIDO: "Esta persona no puede participar de una feria.",
  STOCK_REVENDEDOR_INSUFICIENTE:
    "Esa persona no tiene tantas botellas en su poder. Revisá las cantidades.",
  STOCK_LOTE_INSUFICIENTE: "No hay stock suficiente para esa degustación.",
  STOCK_INSUFICIENTE: "No hay stock suficiente para esa degustación.",
  SIN_ITEMS: "Elegí al menos un producto y una cantidad.",
  LOTE_INVALIDO: "Ese pedido no tiene ese producto.",
  ITEM_DUPLICADO: "Hay un producto repetido. Juntá las cantidades.",
};

/** Códigos de feria que además se muestran en las pantallas de venta propia
 * (`mensajeErrorVentaPropia`). Sin `CANTIDAD_INVALIDA` ni
 * `PRECIO_NO_ASIGNADO`: ahí ya significan otra cosa. */
export const ERRORES_FERIA_EN_VENTA_PROPIA: Record<string, string> = {
  FERIA_CERRADA: ERRORES_FERIA.FERIA_CERRADA,
  PARTICIPACION_CERRADA: ERRORES_FERIA.PARTICIPACION_CERRADA,
  PARTICIPANTES_PENDIENTES: ERRORES_FERIA.PARTICIPANTES_PENDIENTES,
  PARTICIPANTE_CON_MOVIMIENTOS: ERRORES_FERIA.PARTICIPANTE_CON_MOVIMIENTOS,
  VENTA_DE_FERIA: ERRORES_FERIA.VENTA_DE_FERIA,
};

export function mensajeErrorFeria(codigo: string | null | undefined): string {
  return traducirErrorRpc(codigo, ERRORES_FERIA, "No se pudo guardar. Probá de nuevo.");
}
