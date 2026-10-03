import { describe, expect, it } from "vitest";

import { puedeBorrarVentaRevendedor } from "@/lib/dominio/ventas-revendedor";

describe("puedeBorrarVentaRevendedor (espejo de eliminar_venta_revendedor, 0040)", () => {
  it("un admin borra cualquier venta, incluso de otra revendedora y cargada por otro admin", () => {
    expect(
      puedeBorrarVentaRevendedor({ esAdmin: true, miVendedorId: "fran", vendedorId: "ana", registradaPor: "laura" }),
    ).toBe(true);
  });

  it("la revendedora borra las ventas que cargó ella", () => {
    expect(
      puedeBorrarVentaRevendedor({ esAdmin: false, miVendedorId: "ana", vendedorId: "ana", registradaPor: null }),
    ).toBe(true);
    expect(
      puedeBorrarVentaRevendedor({ esAdmin: false, miVendedorId: "ana", vendedorId: "ana", registradaPor: "ana" }),
    ).toBe(true);
  });

  it("la revendedora NO borra una venta que cargó un admin en su nombre", () => {
    expect(
      puedeBorrarVentaRevendedor({ esAdmin: false, miVendedorId: "ana", vendedorId: "ana", registradaPor: "laura" }),
    ).toBe(false);
  });

  it("nadie que no sea admin borra ventas de otra revendedora", () => {
    expect(
      puedeBorrarVentaRevendedor({ esAdmin: false, miVendedorId: "bea", vendedorId: "ana", registradaPor: null }),
    ).toBe(false);
  });
});
