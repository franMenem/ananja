import type { MedioPago } from "@/lib/dominio/caja";
import { formatPresentacion } from "@/lib/negocio";
import type { Tables } from "@/lib/types";

/**
 * Tipos de notificación que arma el bloque "Avisos" al pie de `/tareas`
 * (pantalla `/notificaciones` retirada 2026-09-16, fundida acá — ver
 * `next.config.ts` § redirect). `pago_revendedor` y `deposito_informado`
 * (0057_coordinador_plata_stock.sql) quedan afuera a propósito: cada uno ya
 * es su propia tarea (`lib/dominio/tareas.ts`), mostrarlos también acá
 * duplicaría el mismo aviso.
 */
export type TipoAviso = Exclude<
  Tables<"notificaciones">["tipo"],
  "pago_revendedor" | "deposito_informado"
>;

export type Aviso = {
  id: string;
  created_at: string;
  frase: string;
};

type StockInfo = {
  presentacion_ml: number | null;
  umbral_minimo: number | null;
};

type GastoInfo = {
  monto_centavos: number;
  medio_pago: MedioPago;
  categoria: string | null;
  vendedor: string | null;
};

const TITULOS_TIPO: Record<TipoAviso, string> = {
  stock_bajo: "Stock bajo",
  gasto_nuevo: "Gasto nuevo",
};

const MEDIO_FRASE: Record<MedioPago, string> = {
  efectivo: "pagado en efectivo",
  banco: "pagado por banco",
  mercado_pago: "pagado por Mercado Pago",
};

function nombrePresentacionDeTitulo(titulo: string): string {
  const idx = titulo.indexOf(":");
  return idx >= 0 ? titulo.slice(idx + 1).trim() : titulo;
}

function cantidadDeDetalle(detalle: string | null): number | null {
  const match = detalle?.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function formatPesosRedondeado(centavos: number): string {
  const pesos = Math.round(Math.abs(centavos) / 100);
  return pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Arma la frase completa de un aviso (mismo texto que mostraba
 * `/notificaciones`) a partir de los campos de `notificaciones` más un
 * join liviano a la fila de origen (producto o gasto) para completar
 * mínimo/monto/categoría/vendedor. Pura: recibe los datos ya resueltos,
 * no toca la base (eso lo hace `cargarAvisos`, `lib/notificaciones.ts`).
 */
export function fraseDeAviso(
  n: { tipo: TipoAviso; titulo: string; detalle: string | null; referencia_id: string | null },
  stockPorProducto: Map<string, StockInfo>,
  gastoPorId: Map<string, GastoInfo>,
): string {
  if (n.tipo === "stock_bajo") {
    const info = n.referencia_id ? stockPorProducto.get(n.referencia_id) : undefined;
    const nombre = info?.presentacion_ml
      ? formatPresentacion(info.presentacion_ml)
      : nombrePresentacionDeTitulo(n.titulo || "");
    const cantidad = cantidadDeDetalle(n.detalle);
    if (cantidad == null) return n.titulo || TITULOS_TIPO.stock_bajo;
    const unidad = cantidad === 1 ? "unidad" : "unidades";
    return info?.umbral_minimo != null
      ? `${nombre} quedó en ${cantidad} ${unidad}, por debajo del mínimo de ${info.umbral_minimo}.`
      : `${nombre} quedó en ${cantidad} ${unidad}.`;
  }

  const info = n.referencia_id ? gastoPorId.get(n.referencia_id) : undefined;
  if (!info) return n.titulo || TITULOS_TIPO.gasto_nuevo;
  const vendedor = info.vendedor ?? "Alguien";
  const monto = formatPesosRedondeado(info.monto_centavos);
  const categoria = info.categoria ?? "un gasto";
  const medioFrase = MEDIO_FRASE[info.medio_pago] ?? "";
  return `${vendedor} registró $ ${monto} en ${categoria}, ${medioFrase}.`.trim();
}

function inicioDeDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** "Hoy" / "Ayer" / fecha larga — mismo agrupado por día que usaba
 * `/notificaciones`. Pura, para poder testearla con fechas fijas. */
export function grupoDeFecha(iso: string, ahora: Date): string {
  const fecha = new Date(iso);
  const hoy = inicioDeDia(ahora);
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);

  if (fecha >= hoy) return "Hoy";
  if (fecha >= ayer) return "Ayer";
  const texto = fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Chequea si un `tipo` crudo de `notificaciones` es uno de los que
 * muestra "Avisos" — usado por `cargarAvisos` (`lib/notificaciones.ts`)
 * para angostar el tipo de TypeScript sin un `as`. */
export function esTipoAviso(tipo: Tables<"notificaciones">["tipo"]): tipo is TipoAviso {
  return tipo === "stock_bajo" || tipo === "gasto_nuevo";
}
