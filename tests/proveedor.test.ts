import { describe, expect, it } from "vitest";

import {
  formasProveedor,
  mensajeErrorProveedor,
  normalizarNombreProveedor,
} from "@/lib/dominio/proveedor";

describe("formasProveedor", () => {
  it("con nombre configurado, usa el nombre en cada forma", () => {
    expect(formasProveedor("Olivares del Sur")).toEqual({
      nombre: "Olivares del Sur",
      sujeto: "Olivares del Sur",
      a: "a Olivares del Sur",
      de: "de Olivares del Sur",
      en: "en Olivares del Sur",
      loDe: "lo de Olivares del Sur",
    });
  });

  it("sin nombre (null, undefined, vacío o solo espacios), habla de 'el proveedor'", () => {
    const porDefecto = {
      nombre: "proveedor",
      sujeto: "El proveedor",
      a: "al proveedor",
      de: "del proveedor",
      en: "en el proveedor",
      loDe: "lo del proveedor",
    };
    expect(formasProveedor(null)).toEqual(porDefecto);
    expect(formasProveedor(undefined)).toEqual(porDefecto);
    expect(formasProveedor("")).toEqual(porDefecto);
    expect(formasProveedor("   ")).toEqual(porDefecto);
  });

  it("recorta los espacios de los costados del nombre", () => {
    expect(formasProveedor("  Olivares del Sur ").a).toBe("a Olivares del Sur");
  });
});

describe("mensajeErrorProveedor", () => {
  it("traduce los códigos de la RPC y avisa cuando la base no tiene la migración", () => {
    expect(mensajeErrorProveedor({ message: "NO_AUTORIZADO" })).toBe("No tenés permiso para esto.");
    expect(mensajeErrorProveedor({ message: "NOMBRE_MUY_LARGO" })).toContain("60");
    expect(mensajeErrorProveedor({ message: "x", code: "PGRST202" })).toContain("0069");
    expect(mensajeErrorProveedor({ message: "algo raro" })).toBe(
      "No pudimos guardar el nombre. Probá de nuevo.",
    );
  });
});

describe("normalizarNombreProveedor", () => {
  it("devuelve null para vacío y el nombre recortado para el resto", () => {
    expect(normalizarNombreProveedor(null)).toBeNull();
    expect(normalizarNombreProveedor("  ")).toBeNull();
    expect(normalizarNombreProveedor(" Olivares del Sur ")).toBe("Olivares del Sur");
  });
});
