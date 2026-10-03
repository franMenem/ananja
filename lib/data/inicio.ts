/**
 * Lecturas de Inicio — capa `lib/data` (convención en `lib/data/README.md`).
 * Reusa las fuentes de Tareas (`cargarFuentesTareas`, `lib/data/tareas.ts`)
 * en vez de repetir consultas. Nada de JSX ni agregación: eso vive en
 * `app/(app)/page.tsx` y en las funciones puras de `lib/dominio/inicio.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MedioPago } from "@/lib/dominio/caja";
import { obtenerDestinoEfectivo } from "@/lib/data/plata";
import { cargarFuentesTareas, completarComprobantes, type FuentesTareas } from "@/lib/data/tareas";
import { DESTINO_EFECTIVO_DEFAULT } from "@/lib/dominio/transferencias";
import {
  inicioMesAnterior,
  personasEnManos,
  resumirVentasMes,
  saludoSegunHora,
  type PersonaEnManos,
  type ResumenVentasMes,
} from "@/lib/dominio/inicio";
import { calcularTareas, contarTareasPendientes, type Tarea } from "@/lib/dominio/tareas";
import { NOMBRES_MES, hoyISO, partesFechaHoraArgentina } from "@/lib/fechas";
import { formatPresentacion } from "@/lib/negocio";
import { sesionActual } from "@/lib/sesion-actual";
import type { Database } from "@/lib/types";

/** Todo lo que muestra Inicio — datos planos (sin funciones ni `Map`),
 * listos para pasar del Server Component a la vista. Rediseño de 4 bloques
 * (2026-09-16): Tareas, Plata, Ventas del mes y Depósito (solo si hay algo
 * bajo el mínimo) — "Le deben"/"Lo que debe Ananja" viven en `/plata`, y el
 * gráfico y "Actividad de hoy" se sacaron. */
export interface InicioDatos {
  saludo: string;
  fechaLarga: string;
  nombre: string | null;
  /** Las 3 más urgentes (mismo cálculo que `/tareas`). */
  tareasTop: Tarea[];
  /** Mismo número que el badge y que "N pendientes" de `/tareas`: el total
   * de tareas que le tocan a quien mira (`contarTareasPendientes`). */
  totalTareasBadge: number;
  /** Hay alguna tarea, contando las informativas. */
  hayTareas: boolean;
  errorTareas: boolean;
  medioDeposito: MedioPago;
  cuenta: { totalCentavos: number; mercadoPagoCentavos: number; bancoCentavos: number };
  enManos: PersonaEnManos[];
  ventas: {
    nombreMes: string;
    nombreMesAnterior: string;
    resumen: ResumenVentasMes;
    vacio: boolean;
  };
  /** Solo las presentaciones bajo su mínimo (`v_stock_actual.bajo_umbral`,
   * ya cargado por `cargarFuentesTareas` — Inicio no vuelve a consultar
   * stock). `[]` si no hay ninguna: el bloque "Depósito" no se renderiza. */
  stockBajo: { productoId: string; presentacion: string; stock: number; umbral: number | null }[];
}

function formatFechaLarga(fecha: Date): string {
  const texto = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Loader único de Inicio: un solo `getUser`, las fuentes de Tareas (que ya
 * traen plata en manos y stock — Inicio las reusa en vez de repetir
 * consultas) y en paralelo lo propio de Inicio: Cuenta Ananja, el ingreso
 * de Ananja del mes (`v_margen_ventas`, acotado a mes actual + anterior —
 * es lo único que necesita la comparación "+X% vs mes anterior") y el
 * destino del efectivo (lo usa el "Pasar a la cuenta" inline de "Lo más
 * urgente").
 *
 * Si fallan las fuentes de Tareas, Inicio no se cae: los bloques que
 * dependen de ellas quedan vacíos y se avisa con `errorTareas`.
 */
export async function cargarInicio(supabase: SupabaseClient<Database>): Promise<InicioDatos> {
  const ahora = new Date();
  const hoy = hoyISO();
  const { anio, mes, hora } = partesFechaHoraArgentina(ahora);

  const { vendedor: yo } = await sesionActual();
  const miVendedorId = yo?.id ?? null;

  const [fuentes, cuentaRes, margenRes, destinoEfectivo] = await Promise.all([
    cargarFuentesTareas(supabase, { miVendedorId, hoy }).catch(
      (error: unknown): FuentesTareas | null => {
        console.error("cargarInicio: tareas", error);
        return null;
      },
    ),
    supabase.from("v_cuenta_ananja").select("*").maybeSingle(),
    supabase
      .from("v_margen_ventas")
      .select("fecha, ingreso_ananja_centavos")
      .gte("fecha", inicioMesAnterior(anio, mes)),
    obtenerDestinoEfectivo(supabase),
  ]);

  if (cuentaRes.error) console.error("cargarInicio: cuenta", cuentaRes.error);
  if (margenRes.error) console.error("cargarInicio: margen", margenRes.error);

  // ── Tareas ──
  const tareas = fuentes ? calcularTareas(fuentes.input) : [];
  const tareasTop = await completarComprobantes(supabase, tareas.slice(0, 3));

  // ── Ventas del mes ──
  const filasMargen = (margenRes.data ?? [])
    .filter((f): f is typeof f & { fecha: string } => f.fecha !== null)
    .map((f) => ({
      fecha: f.fecha,
      ingresoAnanjaCentavos: f.ingreso_ananja_centavos,
      gananciaEmpresaCentavos: null,
      gananciaVendedoresCentavos: null,
    }));

  return {
    saludo: saludoSegunHora(hora),
    fechaLarga: formatFechaLarga(ahora),
    nombre: yo?.nombre ?? null,
    tareasTop,
    totalTareasBadge: contarTareasPendientes(tareas),
    hayTareas: tareas.length > 0,
    errorTareas: fuentes === null,
    medioDeposito: destinoEfectivo ?? DESTINO_EFECTIVO_DEFAULT,
    cuenta: {
      totalCentavos: cuentaRes.data?.total_centavos ?? 0,
      mercadoPagoCentavos: cuentaRes.data?.mercado_pago_centavos ?? 0,
      bancoCentavos: cuentaRes.data?.banco_centavos ?? 0,
    },
    enManos: personasEnManos(fuentes?.plataEnManos ?? [], miVendedorId),
    ventas: {
      nombreMes: NOMBRES_MES[mes],
      nombreMesAnterior: NOMBRES_MES[mes === 0 ? 11 : mes - 1],
      resumen: resumirVentasMes(filasMargen, anio, mes),
      vacio: filasMargen.length === 0,
    },
    stockBajo: (fuentes?.stock ?? [])
      .filter((s) => s.producto_id && s.bajo_umbral)
      .map((s) => ({
        productoId: s.producto_id as string,
        presentacion: formatPresentacion(s.presentacion_ml),
        stock: s.stock ?? 0,
        umbral: s.umbral_minimo,
      })),
  };
}
