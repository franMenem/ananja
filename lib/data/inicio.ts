/**
 * Lecturas de Inicio — capa `lib/data` (convención en `lib/data/README.md`).
 * Reusa las fuentes de Tareas (`cargarFuentesTareas`, `lib/data/tareas.ts`)
 * en vez de repetir consultas. Nada de JSX ni agregación: eso vive en
 * `app/(app)/page.tsx` y en las funciones puras de `lib/dominio/inicio.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MedioPago } from "@/lib/dominio/caja";
import { listarGastosConCategoria, listarMargenVentas } from "@/lib/data/ganancia";
import {
  listarDeudaClienteMontos,
  listarDeudaVendedor,
  obtenerDestinoEfectivo,
} from "@/lib/data/plata";
import { cargarFuentesTareas, completarComprobantes, type FuentesTareas } from "@/lib/data/tareas";
import { DESTINO_EFECTIVO_DEFAULT } from "@/lib/dominio/transferencias";
import {
  inicioMesAnterior,
  periodoDeMes,
  periodoMesAnterior,
  resumirPlataEnManos,
  saludoSegunHora,
  totalBotellasDeposito,
  totalLeDeben,
  variacionPorcentual,
} from "@/lib/dominio/inicio";
import {
  filtrarGastosOperativos,
  gananciaAnanjaDelPeriodo,
  mapearFilasMargenVentas,
} from "@/lib/dominio/margen";
import { calcularTareas, contarTareasPendientes, type Tarea } from "@/lib/dominio/tareas";
import { NOMBRES_MES, hoyISO, partesFechaHoraArgentina } from "@/lib/fechas";
import { formatPresentacion } from "@/lib/negocio";
import { sesionActual } from "@/lib/sesion-actual";
import type { Database } from "@/lib/types";

/** Todo lo que muestra Hoy — datos planos (sin funciones ni `Map`), listos
 * para pasar del Server Component a la vista. Rediseño fase 3 (2026-10):
 * "Para hacer" (las 3 tareas más urgentes) y "Cómo estamos" (plata en la
 * cuenta, te deben, botellas en el depósito) más la ganancia del mes. Cada
 * cifra sale de la misma función que la pantalla de origen (`/plata`,
 * `/stock`, `/ganancia`). */
export interface InicioDatos {
  saludo: string;
  fechaLarga: string;
  nombre: string | null;
  /** Las 3 más urgentes (mismo cálculo que `/tareas`). */
  tareasTop: Tarea[];
  /** Mismo número que el badge y que "N pendientes" de `/tareas`: el total
   * de tareas que le tocan a quien mira (`contarTareasPendientes`). */
  totalTareasBadge: number;
  /** Cuántas tareas hay en total, contando las informativas (las que
   * muestra `/tareas`). */
  totalTareas: number;
  errorTareas: boolean;
  medioDeposito: MedioPago;
  /** `v_cuenta_ananja.total_centavos` — la cifra de `/plata`. */
  cuentaTotalCentavos: number;
  /** Plata en manos de personas, con el criterio de `/plata`. */
  enManos: { totalCentavos: number; cantidad: number };
  /** "Le deben a Ananja" (revendedoras + clientes) — la cifra de `/plata`. */
  leDebenCentavos: number;
  /** Σ `v_stock_actual.stock` — lo que muestra `/stock`. */
  botellasDeposito: number;
  /** Solo las presentaciones bajo su mínimo (`v_stock_actual.bajo_umbral`,
   * ya cargado por `cargarFuentesTareas` — Hoy no vuelve a consultar
   * stock). `[]` si no hay ninguna. */
  stockBajo: { productoId: string; presentacion: string; stock: number }[];
  /** "Ganancia de Ananja" de este mes — la de `/ganancia` › "Este mes".
   * `null` si no se pudo leer (no se muestra la línea). */
  ganancia: {
    centavos: number;
    /** `false` = ningún costo cargado todavía: no hay un monto real. */
    algunCostoCargado: boolean;
    /** Variación % vs. el mes anterior; `null` si no hay contra qué comparar. */
    variacionPct: number | null;
    nombreMesAnterior: string;
  } | null;
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

  const desdeMargen = inicioMesAnterior(anio, mes);
  const [fuentes, cuentaRes, margenRes, gastosRes, destinoEfectivo] =
    await Promise.all([
      cargarFuentesTareas(supabase, { miVendedorId, hoy }).catch(
        (error: unknown): FuentesTareas | null => {
          console.error("cargarInicio: tareas", error);
          return null;
        },
      ),
      supabase.from("v_cuenta_ananja").select("*").maybeSingle(),
      listarMargenVentas(supabase, desdeMargen),
      listarGastosConCategoria(supabase, desdeMargen),
      obtenerDestinoEfectivo(supabase),
    ]);

  if (cuentaRes.error) console.error("cargarInicio: cuenta", cuentaRes.error);

  // "Te deben": las mismas vistas (`v_deuda_vendedor` / `v_deuda_cliente`,
  // `select *` sin filtros) que ya leyó `cargarFuentesTareas` — se reusan.
  // Solo si las fuentes fallaron se leen acá, para que esa cifra siga
  // saliendo igual que en `/plata`.
  const [deudaVendedor, deudaCliente] = fuentes
    ? [fuentes.deudaVendedor, fuentes.deudaCliente]
    : await Promise.all([listarDeudaVendedor(supabase), listarDeudaClienteMontos(supabase)]).then(
        ([deudaVendedorRes, deudaClienteRes]) => [deudaVendedorRes.data, deudaClienteRes.data] as const,
      );

  // ── Tareas ──
  const tareas = fuentes ? calcularTareas(fuentes.input) : [];
  const tareasTop = await completarComprobantes(supabase, tareas.slice(0, 3));

  // ── Ganancia del mes: la misma función que `/ganancia` › "Este mes" ──
  let ganancia: InicioDatos["ganancia"] = null;
  if (!margenRes.error && !gastosRes.error) {
    const filasMargen = mapearFilasMargenVentas(margenRes.data);
    const gastos = filtrarGastosOperativos(gastosRes.data);
    const esteMes = gananciaAnanjaDelPeriodo(filasMargen, gastos, "mes", periodoDeMes(anio, mes));
    const mesAnterior = gananciaAnanjaDelPeriodo(filasMargen, gastos, "mes", periodoMesAnterior(anio, mes));
    ganancia = {
      centavos: esteMes.gananciaAnanjaCentavos,
      algunCostoCargado: esteMes.algunCostoCargado,
      variacionPct: variacionPorcentual(esteMes.gananciaAnanjaCentavos, mesAnterior.gananciaAnanjaCentavos),
      nombreMesAnterior: NOMBRES_MES[mes === 0 ? 11 : mes - 1],
    };
  }

  return {
    saludo: saludoSegunHora(hora),
    fechaLarga: formatFechaLarga(ahora),
    nombre: yo?.nombre ?? null,
    tareasTop,
    totalTareasBadge: contarTareasPendientes(tareas),
    totalTareas: tareas.length,
    errorTareas: fuentes === null,
    medioDeposito: destinoEfectivo ?? DESTINO_EFECTIVO_DEFAULT,
    cuentaTotalCentavos: cuentaRes.data?.total_centavos ?? 0,
    enManos: resumirPlataEnManos(fuentes?.plataEnManos ?? []),
    leDebenCentavos: totalLeDeben(deudaVendedor, deudaCliente),
    botellasDeposito: totalBotellasDeposito(fuentes?.stock ?? []),
    ganancia,
    stockBajo: (fuentes?.stock ?? [])
      .filter((s) => s.producto_id && s.bajo_umbral)
      .map((s) => ({
        productoId: s.producto_id as string,
        presentacion: formatPresentacion(s.presentacion_ml),
        stock: s.stock ?? 0,
      })),
  };
}
