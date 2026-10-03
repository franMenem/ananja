import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { esAdminAutenticado, type VendedorConRol } from "@/lib/rol-vendedor";
import type { Database } from "@/lib/types";

/**
 * `esAdminAutenticado` (`lib/rol-vendedor.ts`) — lista BLANCA para las
 * rutas de `/api/*` exclusivas de admin (OCR, push), reemplazo de la lista
 * NEGRA `esRevendedorAutenticado` que dejaba pasar a `coordinador`
 * (0055_coordinador.sql) sin querer (auditoría de seguridad 2026-09-20,
 * ver `app/api/ocr-monto/route.ts` y `app/api/push/*`).
 */

function vendedor(overrides: Partial<VendedorConRol>): VendedorConRol {
  return {
    id: "v1",
    nombre: "Fran",
    activo: true,
    user_id: "u1",
    rol: "admin",
    revende: false,
    email: null,
    creado_en: null,
    encargado_id: null,
    ...overrides,
  };
}

/** Fake mínimo del cliente de Supabase: solo lo que usa
 * `obtenerVendedorPorUserId` (`.from("vendedores").select("*").eq(...).maybeSingle()`). */
function fakeSupabase(data: VendedorConRol | null): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("esAdminAutenticado", () => {
  it("true para admin activo", async () => {
    const supabase = fakeSupabase(vendedor({ rol: "admin" }));
    expect(await esAdminAutenticado(supabase, "u1")).toBe(true);
  });

  it("true para admin activo con espacio de revendedor (revende = true) — sigue siendo admin", async () => {
    const supabase = fakeSupabase(vendedor({ rol: "admin", revende: true }));
    expect(await esAdminAutenticado(supabase, "u1")).toBe(true);
  });

  it("false para admin inactivo", async () => {
    const supabase = fakeSupabase(vendedor({ rol: "admin", activo: false }));
    expect(await esAdminAutenticado(supabase, "u1")).toBe(false);
  });

  it("false para revendedor", async () => {
    const supabase = fakeSupabase(vendedor({ rol: "revendedor" }));
    expect(await esAdminAutenticado(supabase, "u1")).toBe(false);
  });

  it("false para coordinador (0055) — el bug que arregla esta lista blanca: antes esRevendedorAutenticado lo dejaba pasar por no ser 'revendedor'", async () => {
    const supabase = fakeSupabase(vendedor({ rol: "coordinador" }));
    expect(await esAdminAutenticado(supabase, "u1")).toBe(false);
  });

  it("false para pendiente", async () => {
    const supabase = fakeSupabase(vendedor({ rol: "pendiente" }));
    expect(await esAdminAutenticado(supabase, "u1")).toBe(false);
  });

  it("false sin fila (null)", async () => {
    const supabase = fakeSupabase(null);
    expect(await esAdminAutenticado(supabase, "u1")).toBe(false);
  });
});
