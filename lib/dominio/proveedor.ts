/**
 * Formas gramaticales del nombre del proveedor del aceite, para armar los
 * textos de la interfaz sin escribir nunca un nombre a mano en el código.
 * El nombre real lo carga el dueño desde la app (`/stock/proveedor`,
 * migración 0069); mientras no esté cargado, se habla de "el proveedor".
 *
 * Puro: nada de Supabase ni de React (la lectura vive en
 * `lib/data/negocio.ts` y el paso a componentes cliente en
 * `components/stock/proveedor-context.tsx`).
 */

import { ERRORES_RPC_COMUNES, traducirErrorRpc } from "@/lib/dominio/errores-rpc";

/** Largo máximo del nombre — el mismo límite del `check` de la tabla. */
export const PROVEEDOR_NOMBRE_MAX = 60;

export interface FormasProveedor {
  /** Nombre "pelado": el configurado, o "proveedor" por defecto. */
  nombre: string;
  /** Para empezar una oración: "Olivares del Sur" / "El proveedor". */
  sujeto: string;
  /** "a Olivares del Sur" / "al proveedor". */
  a: string;
  /** "de Olivares del Sur" / "del proveedor". */
  de: string;
  /** "en Olivares del Sur" / "en el proveedor". */
  en: string;
  /** "lo de Olivares del Sur" / "lo del proveedor". */
  loDe: string;
}

/** Normaliza lo que viene de la base o del formulario: sin espacios a los
 * costados; vacío = sin nombre (`null`). */
export function normalizarNombreProveedor(nombre: string | null | undefined): string | null {
  const limpio = nombre?.trim();
  return limpio ? limpio : null;
}

export function formasProveedor(nombre: string | null | undefined): FormasProveedor {
  const limpio = normalizarNombreProveedor(nombre);
  if (limpio === null) {
    return {
      nombre: "proveedor",
      sujeto: "El proveedor",
      a: "al proveedor",
      de: "del proveedor",
      en: "en el proveedor",
      loDe: "lo del proveedor",
    };
  }
  return {
    nombre: limpio,
    sujeto: limpio,
    a: `a ${limpio}`,
    de: `de ${limpio}`,
    en: `en ${limpio}`,
    loDe: `lo de ${limpio}`,
  };
}

/** Errores de `guardar_proveedor` (`supabase/migrations/0069`). */
const ERRORES_PROVEEDOR: Record<string, string> = {
  ...ERRORES_RPC_COMUNES,
  NOMBRE_MUY_LARGO: `El nombre puede tener hasta ${PROVEEDOR_NOMBRE_MAX} letras.`,
};

/** Códigos de PostgREST/Postgres cuando la función todavía no existe en la
 * base (la migración 0069 no se aplicó): `PGRST202` = función no
 * encontrada en el schema cache, `42883` = undefined_function, `PGRST205`
 * = tabla no encontrada, `42P01` = undefined_table. */
const CODIGOS_BASE_SIN_MIGRAR = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);

export function mensajeErrorProveedor(error: { message?: string; code?: string }): string {
  if (error.code && CODIGOS_BASE_SIN_MIGRAR.has(error.code)) {
    return "La base de datos todavía no está lista para guardar el nombre del proveedor. Falta aplicar la actualización 0069.";
  }
  return traducirErrorRpc(error.message, ERRORES_PROVEEDOR, "No pudimos guardar el nombre. Probá de nuevo.");
}
