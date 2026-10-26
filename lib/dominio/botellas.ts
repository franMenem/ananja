/**
 * Cifras de la pantalla "Botellas" (`/stock`): cuántas hay en total y dónde
 * están. Puro: recibe filas ya leídas (`v_stock_actual` y
 * `v_stock_revendedor`) y no consulta nada.
 */

import { estimarUnidadesProducibles } from "@/lib/dominio/calculos";

export type FilaDeposito = {
  producto_id: string | null;
  nombre: string | null;
  presentacion_ml: number | null;
  stock: number | null;
  umbral_minimo: number | null;
  bajo_umbral: boolean | null;
};

export type FilaEnManos = {
  producto_id: string | null;
  en_poder: number | null;
};

export type TotalBotellas = {
  deposito: number;
  revendedoras: number;
  total: number;
};

/**
 * Botellas en total = las del depósito (Σ `v_stock_actual.stock`) más las que
 * tienen las revendedoras (Σ `v_stock_revendedor.en_poder`, la misma suma que
 * muestra `/revendedores` como "tienen N botellas").
 */
export function totalBotellas(deposito: Pick<FilaDeposito, "stock">[], enManos: Pick<FilaEnManos, "en_poder">[]): TotalBotellas {
  const enDeposito = deposito.reduce((acc, f) => acc + (f.stock ?? 0), 0);
  const enRevendedoras = enManos.reduce((acc, f) => acc + (f.en_poder ?? 0), 0);
  return { deposito: enDeposito, revendedoras: enRevendedoras, total: enDeposito + enRevendedoras };
}

/** Parte (0 a 100) de la barra que corresponde al depósito. Sin botellas, 0. */
export function porcentajeDeposito(t: Pick<TotalBotellas, "deposito" | "total">): number {
  if (t.total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((t.deposito / t.total) * 100)));
}

export type PresentacionBotellas = {
  productoId: string;
  nombre: string;
  presentacionMl: number;
  deposito: number;
  revendedoras: number;
  umbralMinimo: number;
  /** Quedan pocas en el depósito (mismo criterio que `v_stock_actual.bajo_umbral`). */
  quedanPocas: boolean;
};

/** Una fila por presentación con lo que hay en el depósito y en revendedoras. */
export function repartoPorTamano(deposito: FilaDeposito[], enManos: FilaEnManos[]): PresentacionBotellas[] {
  const enManosPorProducto = new Map<string, number>();
  for (const f of enManos) {
    if (!f.producto_id) continue;
    enManosPorProducto.set(f.producto_id, (enManosPorProducto.get(f.producto_id) ?? 0) + (f.en_poder ?? 0));
  }
  return deposito
    .filter((f): f is FilaDeposito & { producto_id: string } => f.producto_id !== null)
    .map((f) => ({
      productoId: f.producto_id,
      nombre: f.nombre ?? "",
      presentacionMl: f.presentacion_ml ?? 0,
      deposito: f.stock ?? 0,
      revendedoras: enManosPorProducto.get(f.producto_id) ?? 0,
      umbralMinimo: f.umbral_minimo ?? 0,
      quedanPocas: f.bajo_umbral ?? false,
    }));
}

export type AlcancePresentacion = { presentacionMl: number; unidades: number };

/**
 * Para cuántas botellas de cada presentación alcanzan los insumos de un
 * tipo (aceite o etiquetas), según las recetas y lo que hay en el
 * proveedor. Las presentaciones sin receta de ese tipo no aparecen
 * ("no hay con qué estimar" no es lo mismo que "alcanza para 0").
 */
export function alcancePorPresentacion(input: {
  productos: { id: string; presentacion_ml: number }[];
  recetas: { producto_id: string; insumo_id: string; cantidad: number; tipoInsumo: string | null }[];
  stockPorInsumo: Map<string, number>;
  tipo: "materia_prima" | "etiqueta";
}): AlcancePresentacion[] {
  const recetas = input.recetas
    .filter((r) => r.tipoInsumo === input.tipo)
    .map((r) => ({ producto_id: r.producto_id, insumo_id: r.insumo_id, cantidad: r.cantidad }));
  const filas: AlcancePresentacion[] = [];
  for (const p of input.productos) {
    const unidades = estimarUnidadesProducibles(p.id, recetas, input.stockPorInsumo);
    if (unidades !== null) filas.push({ presentacionMl: p.presentacion_ml, unidades });
  }
  return filas;
}
