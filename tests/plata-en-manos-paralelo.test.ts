import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { cargarMovimientosPlata, filtrarEnManosDe } from "@/lib/data/plata";
import { diasEnManoPorPersona } from "@/lib/dominio/movimientos-plata";
import type { Database } from "@/lib/types";

/**
 * `/plata` pide "en manos de" de TODAS las personas junto con el resto y filtra
 * en memoria (antes: una segunda tanda en serie, ya filtrada por la base).
 * Acá se comprueba que las dos formas dan EXACTAMENTE lo mismo, con un
 * Supabase de mentira que sí aplica `eq` / `in` / `or` / `gt` / `order` /
 * `range`. Datos inventados.
 */

type Fila = Record<string, unknown>;

function fakeSupabase(tablas: Record<string, Fila[]>) {
  const from = (tabla: string) => {
    let filas = [...(tablas[tabla] ?? [])];
    let desde = 0;
    let hasta = Infinity;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, v: unknown) => ((filas = filas.filter((f) => f[col] === v)), b),
      gt: (col: string, v: number) => ((filas = filas.filter((f) => (f[col] as number) > v)), b),
      in: (col: string, vs: unknown[]) => ((filas = filas.filter((f) => vs.includes(f[col]))), b),
      or: (expr: string) => {
        const conds = expr.split(",").map((c) => c.split("."));
        filas = filas.filter((f) => conds.some(([col, , v]) => f[col] === v));
        return b;
      },
      order: () => b,
      range: (d: number, h: number) => ((desde = d), (hasta = h), b),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null }).then(res),
    };
    return b;
  };
  return { from, storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } } as unknown as SupabaseClient<Database>;
}

const base = (id: string, n: number) => ({ id, fecha: `2026-10-${String(n).padStart(2, "0")}`, created_at: `2026-10-${String(n).padStart(2, "0")}T15:00:00Z` });

const TABLAS: Record<string, Fila[]> = {
  vendedores: [
    { id: "ana", nombre: "Ana" },
    { id: "bruno", nombre: "Bruno" },
    { id: "carla", nombre: "Carla" },
    { id: "dani", nombre: "Dani" },
  ],
  comprobantes: [
    { ...base("c1", 1), cobrado_centavos: 100_00, medio_pago: "efectivo", vendedor_id: "ana" },
    { ...base("c2", 2), cobrado_centavos: 80_00, medio_pago: "efectivo", vendedor_id: "bruno" },
    { ...base("c3", 3), cobrado_centavos: 70_00, medio_pago: "mercado_pago", vendedor_id: "ana" },
    { ...base("c4", 4), cobrado_centavos: 60_00, medio_pago: "efectivo", vendedor_id: "dani" },
  ],
  cobros: [{ ...base("k1", 5), monto_centavos: 30_00, medio_pago: "efectivo", vendedor_id: "bruno" }],
  gastos: [{ ...base("g1", 6), monto_centavos: 20_00, medio_pago: "efectivo", vendedor_id: "ana", concepto_pago: null }],
  pagos_deuda: [{ ...base("p1", 7), monto_caja_centavos: 10_00, medio_pago: "efectivo", vendedor_id: "dani" }],
  ajustes_caja: [{ ...base("a1", 8), monto_centavos: -5_00, medio_pago: "efectivo", nota: "ajuste", vendedor_id: "bruno" }],
  rendiciones: [
    { ...base("r1", 9), monto_centavos: 40_00, medio_pago: "efectivo", via: "encargado", nota: null, vendedor_id: "carla", tenedor_id: "ana" },
    { ...base("r2", 10), monto_centavos: 25_00, medio_pago: "banco", via: "directo_cuenta", nota: null, vendedor_id: "carla", tenedor_id: null },
    { ...base("r3", 11), monto_centavos: 15_00, medio_pago: "efectivo", via: "encargado", nota: null, vendedor_id: "carla", tenedor_id: "dani" },
  ],
  transferencias_caja: [
    { ...base("t1", 12), monto_centavos: 12_00, origen: "efectivo", destino: "banco", nota: null, vendedor_id: "bruno" },
    { ...base("t2", 13), monto_centavos: 9_00, origen: "banco", destino: "mercado_pago", nota: null, vendedor_id: "ana" },
  ],
  depositos_cuenta: [
    { ...base("d1", 14), monto_centavos: 50_00, medio_pago: "banco", nota: null, tenedor_id: "ana", vendedor_id: "ana" },
    { ...base("d2", 15), monto_centavos: 11_00, medio_pago: "banco", nota: null, tenedor_id: "dani", vendedor_id: "dani" },
  ],
  v_rendiciones_ananja: [
    { rendicion_id: "r1", monto_ananja_centavos: 35_00 },
    { rendicion_id: "r3", monto_ananja_centavos: 15_00 },
  ],
};

describe("/plata: 'en manos de' pedido en paralelo y filtrado en memoria", () => {
  it.each([
    [["ana", "bruno"]],
    [["dani"]],
    [["ana", "bruno", "dani"]],
    [["carla"]],
    [[]],
  ])("da las mismas filas que pedirlas ya filtradas (%j)", async (ids) => {
    const supabase = fakeSupabase(TABLAS);
    const viejo = await cargarMovimientosPlata(supabase, { tipo: "manos", personaIds: ids });
    const todas = await cargarMovimientosPlata(supabase, { tipo: "manos", personaIds: null });
    const nuevo = filtrarEnManosDe(todas, ids);

    const ordenado = (fs: typeof viejo) => fs.map((f) => f.key).sort();
    expect(ordenado(nuevo)).toEqual(ordenado(viejo));
    expect(nuevo.map((f) => f.key)).toEqual(viejo.map((f) => f.key));
    expect(nuevo.map((f) => f.mov)).toEqual(viejo.map((f) => f.mov));
    // sin personas, la lista del caso nuevo trae más filas pero el filtro las descarta
    expect(todas.length).toBeGreaterThanOrEqual(nuevo.length);
  });

  it("los días en mano por persona salen idénticos", async () => {
    const supabase = fakeSupabase(TABLAS);
    const personas = [
      { tenedor_id: "ana", total_centavos: 90_00 },
      { tenedor_id: "bruno", total_centavos: 105_00 },
      { tenedor_id: "dani", total_centavos: 40_00 },
    ];
    const ids = personas.map((p) => p.tenedor_id);
    const viejo = await cargarMovimientosPlata(supabase, { tipo: "manos", personaIds: ids });
    const todas = await cargarMovimientosPlata(supabase, { tipo: "manos", personaIds: null });

    const dias = (filas: typeof viejo) => [...diasEnManoPorPersona(personas, filas, "2026-10-26")].sort();
    expect(dias(filtrarEnManosDe(todas, ids))).toEqual(dias(viejo));
  });
});
