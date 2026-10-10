import { describe, expect, it } from "vitest";

import { decidirRedireccion } from "@/lib/supabase/middleware";
import type { VendedorConRol } from "@/lib/rol-vendedor";

/**
 * `decidirRedireccion` (`lib/supabase/middleware.ts`) — decisión pura de
 * redirect por rol/acceso, extraída de `updateSession` para poder
 * testearla sin un `NextRequest` real. Casos según
 * `0026_roles_pendiente_espacio_revendedor.sql` (rol `pendiente` +
 * espacio de revendedor de un admin).
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
    toma_directo: false,
    ...overrides,
  };
}

describe("decidirRedireccion", () => {
  it("sin fila (null) → /sin-acceso", () => {
    expect(decidirRedireccion(null, "/")).toBe("/sin-acceso");
  });

  it("inactivo → /sin-acceso", () => {
    const v = vendedor({ rol: "admin", activo: false });
    expect(decidirRedireccion(v, "/")).toBe("/sin-acceso");
  });

  it("pendiente → /sin-acceso", () => {
    const v = vendedor({ rol: "pendiente" });
    expect(decidirRedireccion(v, "/")).toBe("/sin-acceso");
    expect(decidirRedireccion(v, "/mi")).toBe("/sin-acceso");
  });

  it("revendedor fuera de /mi → /mi", () => {
    const v = vendedor({ rol: "revendedor" });
    expect(decidirRedireccion(v, "/")).toBe("/mi");
    expect(decidirRedireccion(v, "/caja")).toBe("/mi");
  });

  it("revendedor dentro de /mi → sin redirect", () => {
    const v = vendedor({ rol: "revendedor" });
    expect(decidirRedireccion(v, "/mi")).toBeNull();
    expect(decidirRedireccion(v, "/mi/ventas")).toBeNull();
  });

  it("revendedor en ruta pública (/login) → sin redirect por rol", () => {
    const v = vendedor({ rol: "revendedor" });
    expect(decidirRedireccion(v, "/login")).toBeNull();
  });

  it("admin sin espacio de revendedor en /mi → /", () => {
    const v = vendedor({ rol: "admin", revende: false });
    expect(decidirRedireccion(v, "/mi")).toBe("/");
    expect(decidirRedireccion(v, "/mi/ventas")).toBe("/");
  });

  it("admin sin espacio de revendedor fuera de /mi → sin redirect", () => {
    const v = vendedor({ rol: "admin", revende: false });
    expect(decidirRedireccion(v, "/")).toBeNull();
    expect(decidirRedireccion(v, "/caja")).toBeNull();
  });

  it("admin con espacio de revendedor → sin redirect en /mi ni fuera", () => {
    const v = vendedor({ rol: "admin", revende: true });
    expect(decidirRedireccion(v, "/mi")).toBeNull();
    expect(decidirRedireccion(v, "/mi/ventas")).toBeNull();
    expect(decidirRedireccion(v, "/")).toBeNull();
    expect(decidirRedireccion(v, "/caja")).toBeNull();
  });

  it("admin inactivo con espacio de revendedor → /sin-acceso (activo manda primero)", () => {
    const v = vendedor({ rol: "admin", revende: true, activo: false });
    expect(decidirRedireccion(v, "/mi")).toBe("/sin-acceso");
  });

  it("coordinador fuera de /mi → /mi (0055)", () => {
    const v = vendedor({ rol: "coordinador" });
    expect(decidirRedireccion(v, "/")).toBe("/mi");
    expect(decidirRedireccion(v, "/caja")).toBe("/mi");
    expect(decidirRedireccion(v, "/revendedores")).toBe("/mi");
  });

  it("coordinador escribiendo /tareas o /plata a mano → /mi (0057, revisión adversarial § 3: sin esto vería pantallas rotas de un sector que no le corresponde)", () => {
    const v = vendedor({ rol: "coordinador" });
    expect(decidirRedireccion(v, "/tareas")).toBe("/mi");
    expect(decidirRedireccion(v, "/plata")).toBe("/mi");
    expect(decidirRedireccion(v, "/plata/depositar")).toBe("/mi");
  });

  it("coordinador en /mi a secas → sin redirect", () => {
    const v = vendedor({ rol: "coordinador" });
    expect(decidirRedireccion(v, "/mi")).toBeNull();
  });

  it("coordinador en una subruta de revendedor de /mi → /mi (no le corresponde)", () => {
    const v = vendedor({ rol: "coordinador" });
    expect(decidirRedireccion(v, "/mi/ventas")).toBe("/mi");
    expect(decidirRedireccion(v, "/mi/pagar")).toBe("/mi");
    expect(decidirRedireccion(v, "/mi/material")).toBe("/mi");
    expect(decidirRedireccion(v, "/mi/ganancia")).toBe("/mi");
  });

  it("coordinador en ruta pública (/login) → sin redirect por rol", () => {
    const v = vendedor({ rol: "coordinador" });
    expect(decidirRedireccion(v, "/login")).toBeNull();
  });
});
