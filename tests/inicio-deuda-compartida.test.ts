import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sesion-actual", () => ({
  sesionActual: async () => ({ userId: "u", vendedor: { id: "yo", nombre: "Yo" } }),
}));

import { cargarInicio } from "@/lib/data/inicio";
import { totalLeDeben } from "@/lib/dominio/inicio";
import type { Database } from "@/lib/types";

/**
 * Hoy ya no lee de nuevo `v_deuda_vendedor` / `v_deuda_cliente`: usa las filas
 * que trae `cargarFuentesTareas`. La cifra "Te deben" tiene que salir igual
 * que antes (la que calcula `/plata` con `totalLeDeben` sobre las mismas
 * vistas). Datos inventados.
 */

type Fila = Record<string, unknown>;

const DEUDA_VENDEDOR: Fila[] = [
  { vendedor_id: "ana", nombre: "Ana", saldo_centavos: 120_000, entregado_centavos: 200_000 },
  { vendedor_id: "bruno", nombre: "Bruno", saldo_centavos: 0, entregado_centavos: 50_000 },
  { vendedor_id: "carla", nombre: "Carla", saldo_centavos: 45_000, entregado_centavos: 90_000 },
];
const DEUDA_CLIENTE: Fila[] = [
  { cliente_id: "c1", deuda_centavos: 30_000 },
  { cliente_id: "c2", deuda_centavos: 0 },
];

function fakeSupabase(tablas: Record<string, Fila[]>, conError: string[] = []) {
  const lecturas: Record<string, number> = {};
  const from = (tabla: string) => {
    lecturas[tabla] = (lecturas[tabla] ?? 0) + 1;
    const falla = conError.includes(tabla) ? { message: "boom" } : null;
    const filas = falla ? null : (tablas[tabla] ?? []);
    const b: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (res: (v: unknown) => unknown) => Promise.resolve({ data: filas, error: falla }).then(res);
          }
          if (prop === "maybeSingle" || prop === "single") {
            return () => Promise.resolve({ data: filas?.[0] ?? null, error: falla });
          }
          return () => b;
        },
      },
    );
    return b;
  };
  return { supabase: { from } as unknown as SupabaseClient<Database>, lecturas };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cargarInicio — 'Te deben' reusa las lecturas de Tareas", () => {
  const esperado = totalLeDeben(
    DEUDA_VENDEDOR as { vendedor_id: string; nombre: string; saldo_centavos: number }[],
    DEUDA_CLIENTE as { deuda_centavos: number }[],
  );

  it("da la misma cifra que /plata y lee cada vista de deuda una sola vez", async () => {
    const { supabase, lecturas } = fakeSupabase({ v_deuda_vendedor: DEUDA_VENDEDOR, v_deuda_cliente: DEUDA_CLIENTE });
    const datos = await cargarInicio(supabase);
    expect(esperado).toBe(165_000 + 30_000);
    expect(datos.leDebenCentavos).toBe(esperado);
    expect(datos.errorTareas).toBe(false);
    expect(lecturas["v_deuda_vendedor"]).toBe(1);
    expect(lecturas["v_deuda_cliente"]).toBe(1);
  });

  it("si fallan las fuentes de Tareas, igual da la misma cifra (las lee aparte)", async () => {
    const { supabase, lecturas } = fakeSupabase(
      { v_deuda_vendedor: DEUDA_VENDEDOR, v_deuda_cliente: DEUDA_CLIENTE },
      ["v_stock_actual"],
    );
    const datos = await cargarInicio(supabase);
    expect(datos.errorTareas).toBe(true);
    expect(datos.leDebenCentavos).toBe(esperado);
    // una lectura de cada una dentro de las fuentes (que fallaron) y otra de respaldo
    expect(lecturas["v_deuda_vendedor"]).toBe(2);
    expect(lecturas["v_deuda_cliente"]).toBe(2);
  });
});
