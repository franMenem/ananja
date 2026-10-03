import { describe, expect, it } from "vitest";

import { tabActivaMi } from "@/lib/navegacion-mi";

describe("tabActivaMi", () => {
  it("\"/mi\" exacto es Mi stock", () => {
    expect(tabActivaMi("/mi")).toBe("/mi");
  });

  it("\"/mi/pagar\" no marca ningún ítem (\"/mi\" no matchea por prefijo)", () => {
    expect(tabActivaMi("/mi/pagar")).toBeNull();
  });

  it("subrutas marcan su sección", () => {
    expect(tabActivaMi("/mi/ventas/nueva")).toBe("/mi/ventas");
    expect(tabActivaMi("/mi/ventas/abc")).toBe("/mi/ventas");
    expect(tabActivaMi("/mi/material/xyz")).toBe("/mi/material");
    expect(tabActivaMi("/mi/ganancia")).toBe("/mi/ganancia");
  });

  it("no confunde prefijos parciales", () => {
    expect(tabActivaMi("/mi/ventasx")).toBeNull();
  });
});
