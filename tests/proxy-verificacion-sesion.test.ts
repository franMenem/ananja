import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integración de `updateSession` (`lib/supabase/middleware.ts`) con el
 * cliente de Supabase mockeado: cuándo el proxy llama a `getUser()` y cuándo
 * le alcanza con `getClaims()`. Datos inventados.
 */

type Claims = Record<string, unknown> | null;
interface Escenario {
  claims: Claims;
  claimsError: unknown;
  claimsLanza: boolean;
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null;
  vendedor: Record<string, unknown> | null;
}

const estado = vi.hoisted(() => ({
  esc: null as unknown as Escenario,
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: estado.getClaims, getUser: estado.getUser },
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: estado.esc.vendedor, error: null }),
      };
      return b;
    },
  }),
}));

import { updateSession } from "@/lib/supabase/middleware";

const EXP = Math.floor(Date.now() / 1000) + 3600;

function claimsOk(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { sub: "u1", role: "authenticated", exp: EXP, app_metadata: {}, user_metadata: {}, ...extra };
}

function vendedor(extra: Record<string, unknown> = {}) {
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
    toma_directo: false,
    ...extra,
  };
}

function preparar(extra: Partial<Escenario> = {}) {
  estado.esc = {
    claims: claimsOk(),
    claimsError: null,
    claimsLanza: false,
    user: { id: "u1", app_metadata: {}, user_metadata: {} },
    vendedor: vendedor(),
    ...extra,
  };
  estado.getClaims.mockImplementation(async () => {
    if (estado.esc.claimsLanza) throw new Error("boom");
    return {
      data: estado.esc.claims ? { claims: estado.esc.claims } : null,
      error: estado.esc.claimsError,
    };
  });
  estado.getUser.mockImplementation(async () => ({ data: { user: estado.esc.user } }));
}

const pedir = (ruta = "/") => updateSession(new NextRequest(`http://localhost:3000${ruta}`));
const destino = (r: Response) => r.headers.get("location");

beforeEach(() => {
  estado.getClaims.mockReset();
  estado.getUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("updateSession — verificación híbrida de sesión", () => {
  it("sesión normal: no llama a getUser, deja pasar y manda el header de sesión", async () => {
    preparar();
    const r = await pedir("/");
    expect(estado.getUser).not.toHaveBeenCalled();
    expect(estado.getClaims).toHaveBeenCalledTimes(1);
    expect(destino(r)).toBeNull();
    expect(r.headers.get("x-middleware-request-x-ananja-sesion")).toBeTruthy();
  });

  it("flag must_change_password en el claim: confirma con getUser", async () => {
    preparar({ claims: claimsOk({ app_metadata: { must_change_password: true } }) });
    await pedir("/");
    expect(estado.getUser).toHaveBeenCalledTimes(1);
  });

  it("flag de bienvenida en el claim: confirma con getUser, y si ya está apagado no rebota", async () => {
    preparar({ claims: claimsOk({ user_metadata: { bienvenida_pendiente: true } }) });
    const r = await pedir("/");
    expect(estado.getUser).toHaveBeenCalledTimes(1);
    expect(destino(r)).toBeNull();
  });

  it("flag en el claim y en el valor fresco: redirige a /cambiar-password", async () => {
    preparar({
      claims: claimsOk({ app_metadata: { must_change_password: true } }),
      user: { id: "u1", app_metadata: { must_change_password: true }, user_metadata: {} },
    });
    const r = await pedir("/");
    expect(destino(r)).toContain("/cambiar-password");
  });

  it("claims nulos: llama a getUser", async () => {
    preparar({ claims: null });
    await pedir("/");
    expect(estado.getUser).toHaveBeenCalledTimes(1);
  });

  it("error de getClaims: llama a getUser y no rechaza una sesión válida", async () => {
    preparar({ claims: null, claimsError: { name: "AuthRetryableFetchError" } });
    const r = await pedir("/");
    expect(estado.getUser).toHaveBeenCalledTimes(1);
    expect(destino(r)).toBeNull();
  });

  it("getClaims que lanza: llama a getUser", async () => {
    preparar({ claimsLanza: true });
    const r = await pedir("/");
    expect(estado.getUser).toHaveBeenCalledTimes(1);
    expect(destino(r)).toBeNull();
  });

  it("sin sesión: redirige a /login como antes", async () => {
    preparar({ claims: null, user: null });
    const r = await pedir("/");
    expect(estado.getUser).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(302);
    expect(destino(r)).toContain("/login");
  });

  it("claim viciado y getUser sin usuario: no deja pasar", async () => {
    preparar({ claims: claimsOk({ role: "anon" }), user: null });
    const r = await pedir("/");
    expect(destino(r)).toContain("/login");
  });

  it("cuenta inactiva con claim válido: sigue yendo a /sin-acceso (vendedores se lee igual)", async () => {
    preparar({ vendedor: vendedor({ activo: false }) });
    const r = await pedir("/");
    expect(estado.getUser).not.toHaveBeenCalled();
    expect(destino(r)).toContain("/sin-acceso");
  });

  it("/api con claim válido y vendedor inactivo: 403 JSON, sin getUser", async () => {
    preparar({ vendedor: vendedor({ activo: false }) });
    const r = await pedir("/api/push/send");
    expect(estado.getUser).not.toHaveBeenCalled();
    expect(r.status).toBe(403);
  });

  it("revendedora con claim válido fuera de /mi: redirige a /mi", async () => {
    preparar({ vendedor: vendedor({ rol: "revendedor" }) });
    const r = await pedir("/stock");
    expect(destino(r)).toContain("/mi");
  });

  it("con sesión en /login redirige a / usando el claim", async () => {
    preparar();
    const r = await pedir("/login");
    expect(estado.getUser).not.toHaveBeenCalled();
    expect(new URL(destino(r) ?? "").pathname).toBe("/");
  });
});
