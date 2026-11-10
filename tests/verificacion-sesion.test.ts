import { describe, expect, it } from "vitest";

import { decidirVerificacionSesion, type ClaimsSesion } from "@/lib/dominio/verificacion-sesion";

/**
 * Decisión rápido/lento de la verificación de sesión del proxy
 * (`lib/dominio/verificacion-sesion.ts`). Datos inventados.
 */

const AHORA = 1_800_000_000;

function claims(extra: Partial<ClaimsSesion> = {}): ClaimsSesion {
  return {
    sub: "user-1",
    role: "authenticated",
    exp: AHORA + 3600,
    app_metadata: {},
    user_metadata: {},
    ...extra,
  };
}

const decidir = (c: ClaimsSesion | null | undefined, error?: unknown) =>
  decidirVerificacionSesion({ claims: c, error, ahoraSegundos: AHORA });

describe("decidirVerificacionSesion", () => {
  it("claims válidos y sin flags → usa el claim, con la identidad del sub", () => {
    expect(decidir(claims({ app_metadata: { provider: "email" }, user_metadata: { display_name: "Ana" } }))).toEqual({
      via: "usar_claims",
      identidad: {
        id: "user-1",
        app_metadata: { provider: "email" },
        user_metadata: { display_name: "Ana" },
      },
    });
  });

  it("metadatos ausentes en el claim → objetos vacíos", () => {
    expect(decidir(claims({ app_metadata: undefined, user_metadata: null }))).toEqual({
      via: "usar_claims",
      identidad: { id: "user-1", app_metadata: {}, user_metadata: {} },
    });
  });

  it("flags explícitamente en false siguen siendo camino rápido", () => {
    const c = claims({
      app_metadata: { must_change_password: false, bienvenida_pendiente: false },
      user_metadata: { must_change_password: false, bienvenida_pendiente: false },
    });
    expect(decidir(c).via).toBe("usar_claims");
  });

  it.each([
    ["must_change_password en app_metadata", { app_metadata: { must_change_password: true } }],
    ["bienvenida_pendiente en app_metadata", { app_metadata: { bienvenida_pendiente: true } }],
    ["must_change_password en user_metadata", { user_metadata: { must_change_password: true } }],
    ["bienvenida_pendiente en user_metadata", { user_metadata: { bienvenida_pendiente: true } }],
  ])("%s → confirma con getUser", (_nombre, extra) => {
    expect(decidir(claims(extra))).toEqual({ via: "confirmar_con_getuser" });
  });

  it("claims nulos o indefinidos → confirma con getUser", () => {
    expect(decidir(null).via).toBe("confirmar_con_getuser");
    expect(decidir(undefined).via).toBe("confirmar_con_getuser");
  });

  it("error de getClaims → confirma con getUser, aunque vengan claims", () => {
    expect(decidir(null, new Error("jwks")).via).toBe("confirmar_con_getuser");
    expect(decidir(claims(), { name: "AuthRetryableFetchError" }).via).toBe("confirmar_con_getuser");
  });

  it.each([
    ["sin sub", { sub: undefined }],
    ["sub vacío", { sub: "" }],
    ["sub que no es string", { sub: 42 }],
    ["rol anon", { role: "anon" }],
    ["sin rol", { role: undefined }],
    ["sin exp", { exp: undefined }],
    ["token vencido", { exp: AHORA - 1 }],
    ["vence justo ahora", { exp: AHORA }],
  ])("claim raro (%s) → confirma con getUser", (_nombre, extra) => {
    expect(decidir(claims(extra as Partial<ClaimsSesion>)).via).toBe("confirmar_con_getuser");
  });
});
