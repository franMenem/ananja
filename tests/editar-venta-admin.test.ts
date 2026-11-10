// Editar una venta de revendedora desde la ficha del admin: regla de pantalla
// (espejo de `editar_venta_revendedor` vigente en prod) y carga SIN filtrar por
// quién mira pero validando que la venta sea de la revendedora de la ficha.
// Datos inventados.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { cargarVentaParaEdicionDeAdmin } from "@/lib/data/revendedores";
import { decidirEdicionVentaRevendedor, puedeEditarVentaRevendedor } from "@/lib/dominio/ventas-revendedor";
import type { Database } from "@/lib/types";

const admin = { esAdmin: true, miVendedorId: "admin-1", vendedorId: "reve-1", registradaPor: "otro-admin" };

describe("decidirEdicionVentaRevendedor (admin)", () => {
  it("un admin edita la venta de otra persona aunque la haya cargado otro admin", () => {
    expect(decidirEdicionVentaRevendedor(admin)).toEqual({ puede: true });
  });

  it("un admin edita una venta que salió de una feria (la RPC no la rechaza para admin)", () => {
    expect(decidirEdicionVentaRevendedor({ ...admin, feriaId: "feria-1" })).toEqual({ puede: true });
  });

  it("con rendición ligada no se edita, ni siquiera un admin, y dice por qué", () => {
    const d = decidirEdicionVentaRevendedor({ ...admin, conRendicion: true });
    expect(d.puede).toBe(false);
    if (!d.puede) expect(d.motivo).toMatch(/rendición/);
  });

  it("sin conRendicion informado se comporta como antes para la revendedora", () => {
    const yo = { esAdmin: false, miVendedorId: "yo", vendedorId: "yo", registradaPor: null };
    expect(puedeEditarVentaRevendedor(yo)).toBe(true);
    expect(puedeEditarVentaRevendedor({ ...yo, feriaId: "f" })).toBe(false);
    expect(puedeEditarVentaRevendedor({ ...yo, registradaPor: "admin" })).toBe(false);
    expect(puedeEditarVentaRevendedor({ ...yo, conRendicion: true })).toBe(false);
  });
});

type Fila = Record<string, unknown>;

/** Cliente falso: aplica los `.eq` encadenados sobre filas en memoria. */
function clienteFalso(tablas: Record<string, Fila[]>) {
  const eqs: { tabla: string; col: string; val: unknown }[] = [];
  const from = (tabla: string) => {
    const filtros: [string, unknown][] = [];
    let head = false;
    const resultado = () => {
      const filas = (tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v));
      return { data: head ? null : filas, count: filas.length, error: null };
    };
    const q = {
      select: (_c: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return q;
      },
      eq: (col: string, val: unknown) => {
        filtros.push([col, val]);
        eqs.push({ tabla, col, val });
        return q;
      },
      order: () => q,
      maybeSingle: async () => ({ data: resultado().data?.[0] ?? null, error: null }),
      then: (ok: (r: unknown) => unknown) => Promise.resolve(resultado()).then(ok),
    };
    return q;
  };
  return { supabase: { from } as unknown as SupabaseClient<Database>, eqs };
}

describe("cargarVentaParaEdicionDeAdmin", () => {
  const venta = { id: "v1", grupo_id: "g1", vendedor_id: "reve-1", registrada_por: "admin-9", cantidad: 2 };
  const otraFila = { id: "v2", grupo_id: "g1", vendedor_id: "reve-1", registrada_por: "admin-9", cantidad: 3 };

  it("carga una venta que cargó otro admin, sin filtrar por quien mira, y junta el grupo", async () => {
    const { supabase, eqs } = clienteFalso({ ventas_revendedor: [venta, otraFila], rendiciones: [] });
    const r = await cargarVentaParaEdicionDeAdmin(supabase, "reve-1", "v1");
    expect(r?.venta.id).toBe("v1");
    expect(r?.filas.map((f) => f.id)).toEqual(["v1", "v2"]);
    expect(r?.conRendicion).toBe(false);
    // Solo filtra por id de venta, grupo y la revendedora de la ficha: nunca por registrada_por ni por la sesión.
    expect(eqs.every((e) => ["id", "grupo_id", "vendedor_id", "venta_grupo_id"].includes(e.col))).toBe(true);
  });

  it("no devuelve la venta de otra persona aunque exista (pertenencia a la ficha)", async () => {
    const { supabase } = clienteFalso({ ventas_revendedor: [venta], rendiciones: [] });
    expect(await cargarVentaParaEdicionDeAdmin(supabase, "otra-persona", "v1")).toBeNull();
  });

  it("marca conRendicion cuando el grupo tiene una rendición ligada", async () => {
    const { supabase } = clienteFalso({
      ventas_revendedor: [venta],
      rendiciones: [{ id: "r1", venta_grupo_id: "g1" }],
    });
    expect((await cargarVentaParaEdicionDeAdmin(supabase, "reve-1", "v1"))?.conRendicion).toBe(true);
  });

  it("si no existe devuelve null", async () => {
    const { supabase } = clienteFalso({ ventas_revendedor: [], rendiciones: [] });
    expect(await cargarVentaParaEdicionDeAdmin(supabase, "reve-1", "nada")).toBeNull();
  });
});
