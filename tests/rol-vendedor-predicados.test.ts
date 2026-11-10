import { describe, expect, it } from "vitest";

import {
  FILTRO_ROLES_ENCARGADO,
  esCoordinador,
  puedeRevender,
  puedeSerEncargado,
  puedeUsarShellMi,
  tieneAccesoValido,
  type VendedorConRol,
} from "@/lib/rol-vendedor";

function v(rol: string, activo = true, revende = false): VendedorConRol {
  return { rol, activo, revende } as unknown as VendedorConRol;
}

describe("rol-vendedor", () => {
  it("tieneAccesoValido: activo y no pendiente", () => {
    expect(tieneAccesoValido(null)).toBe(false);
    expect(tieneAccesoValido(v("admin", false))).toBe(false);
    expect(tieneAccesoValido(v("pendiente"))).toBe(false);
    expect(tieneAccesoValido(v("revendedor"))).toBe(true);
    expect(tieneAccesoValido(v("coordinador"))).toBe(true);
  });

  it("puedeRevender: revendedor, o admin con espacio propio, siempre activo", () => {
    expect(puedeRevender(null)).toBe(false);
    expect(puedeRevender(v("revendedor"))).toBe(true);
    expect(puedeRevender(v("revendedor", false))).toBe(false);
    expect(puedeRevender(v("admin", true, true))).toBe(true);
    expect(puedeRevender(v("admin", true, false))).toBe(false);
    expect(puedeRevender(v("coordinador", true, true))).toBe(false);
  });

  it("esCoordinador: solo coordinador activo", () => {
    expect(esCoordinador(null)).toBe(false);
    expect(esCoordinador(v("coordinador"))).toBe(true);
    expect(esCoordinador(v("coordinador", false))).toBe(false);
    expect(esCoordinador(v("admin"))).toBe(false);
  });

  it("puedeUsarShellMi: revendedor, admin con espacio o coordinador", () => {
    expect(puedeUsarShellMi(v("revendedor"))).toBe(true);
    expect(puedeUsarShellMi(v("admin", true, true))).toBe(true);
    expect(puedeUsarShellMi(v("coordinador"))).toBe(true);
    expect(puedeUsarShellMi(v("admin"))).toBe(false);
    expect(puedeUsarShellMi(null)).toBe(false);
  });

  it("puedeSerEncargado: admin o coordinador activo, y coincide con el filtro de la base", () => {
    expect(puedeSerEncargado(null)).toBe(false);
    expect(puedeSerEncargado(undefined)).toBe(false);
    expect(puedeSerEncargado(v("admin"))).toBe(true);
    expect(puedeSerEncargado(v("coordinador"))).toBe(true);
    expect(puedeSerEncargado(v("admin", false))).toBe(false);
    expect(puedeSerEncargado(v("revendedor"))).toBe(false);
    expect(puedeSerEncargado(v("pendiente"))).toBe(false);
    for (const rol of ["admin", "coordinador", "revendedor", "pendiente"]) {
      expect(FILTRO_ROLES_ENCARGADO.includes(rol)).toBe(puedeSerEncargado(v(rol)));
    }
  });
});
