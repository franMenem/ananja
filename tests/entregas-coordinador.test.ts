import { describe, expect, it } from "vitest";

import {
  armarEntregasCoordinadora,
  type DatosEntregasCoordinadora,
  type EntregaCruda,
  type ItemEntregaCrudo,
} from "@/lib/dominio/entregas-coordinador";

const COORD = "coord-a";

function entrega(id: string, fecha: string, createdAt: string, extra: Partial<EntregaCruda> = {}): EntregaCruda {
  return { id, vendedor_id: "rev-1", admin_id: COORD, tipo: "entrega", fecha, created_at: createdAt, ...extra };
}

function item(entregaId: string, productoId: string, cantidad: number, loteId: string | null = null): ItemEntregaCrudo {
  return { entrega_id: entregaId, producto_id: productoId, cantidad, lote_id: loteId };
}

function datos(parcial: Partial<DatosEntregasCoordinadora>): DatosEntregasCoordinadora {
  return {
    coordinadorId: COORD,
    entregas: [],
    items: [],
    nombrePorVendedor: new Map([
      ["rev-1", "Revendedora 1"],
      ["rev-2", "Revendedora 2"],
      [COORD, "Coordinadora A"],
      ["admin-1", "Admin 1"],
    ]),
    nombrePorProducto: new Map([
      ["p1", "Aceite 500 ml"],
      ["p2", "Aceite 250 ml"],
    ]),
    fechaPorLote: new Map([["l1", "2026-08-03"]]),
    ...parcial,
  };
}

describe("armarEntregasCoordinadora", () => {
  it("ordena de la más nueva a la más vieja, desempatando por created_at y luego por id", () => {
    const { filas } = armarEntregasCoordinadora(
      datos({
        entregas: [
          entrega("e-vieja", "2026-09-01", "2026-09-01T10:00:00Z"),
          entrega("e-tarde", "2026-09-10", "2026-09-10T15:00:00Z"),
          entrega("e-temprano", "2026-09-10", "2026-09-10T09:00:00Z"),
          entrega("b", "2026-09-05", "2026-09-05T09:00:00Z"),
          entrega("a", "2026-09-05", "2026-09-05T09:00:00Z"),
        ],
      }),
    );
    expect(filas.map((f) => f.id)).toEqual(["e-tarde", "e-temprano", "a", "b", "e-vieja"]);
  });

  it("arma cada fila con revendedora, producto y lote (con o sin lote)", () => {
    const { filas } = armarEntregasCoordinadora(
      datos({
        entregas: [entrega("e1", "2026-09-10", "2026-09-10T10:00:00Z")],
        items: [item("e1", "p1", 6, "l1"), item("e1", "p2", 2), item("e1", "p2", 1, "l-sin-fecha")],
      }),
    );
    expect(filas[0].revendedoraId).toBe("rev-1");
    expect(filas[0].revendedoraNombre).toBe("Revendedora 1");
    expect(filas[0].tipo).toBe("entrega");
    expect(filas[0].items).toEqual([
      { productoNombre: "Aceite 500 ml", cantidad: 6, loteId: "l1", loteFecha: "2026-08-03" },
      { productoNombre: "Aceite 250 ml", cantidad: 2, loteId: null, loteFecha: null },
      { productoNombre: "Aceite 250 ml", cantidad: 1, loteId: "l-sin-fecha", loteFecha: null },
    ]);
  });

  it("marca quién la cargó solo si no fue la propia coordinadora", () => {
    const { filas } = armarEntregasCoordinadora(
      datos({
        entregas: [
          entrega("propia", "2026-09-10", "2026-09-10T10:00:00Z"),
          entrega("de-admin", "2026-09-09", "2026-09-09T10:00:00Z", { admin_id: "admin-1" }),
          entrega("desconocido", "2026-09-08", "2026-09-08T10:00:00Z", { admin_id: "otro" }),
        ],
      }),
    );
    expect(filas.map((f) => f.cargadaPor)).toEqual([null, "Admin 1", "alguien"]);
  });

  it("el total resta las devoluciones y se abre por producto", () => {
    const resultado = armarEntregasCoordinadora(
      datos({
        entregas: [
          entrega("e1", "2026-09-01", "2026-09-01T10:00:00Z"),
          entrega("e2", "2026-09-02", "2026-09-02T10:00:00Z", { vendedor_id: "rev-2" }),
          entrega("d1", "2026-09-03", "2026-09-03T10:00:00Z", { tipo: "devolucion" }),
        ],
        items: [item("e1", "p1", 10), item("e1", "p2", 4), item("e2", "p1", 5), item("d1", "p1", 3), item("d1", "p2", 4)],
      }),
    );
    expect(resultado.filas.find((f) => f.id === "d1")?.tipo).toBe("devolucion");
    expect(resultado.totalBotellas).toBe(12);
    // p2 queda en 0 (4 entregadas, 4 devueltas): no se lista.
    expect(resultado.totalPorProducto).toEqual([{ productoNombre: "Aceite 500 ml", cantidad: 12 }]);
  });

  it("las entregas automáticas (0073) se listan marcadas, sin 'la cargó X' y fuera de los totales", () => {
    const resultado = armarEntregasCoordinadora(
      datos({
        entregas: [
          entrega("manual", "2026-09-01", "2026-09-01T10:00:00Z"),
          entrega("auto", "2026-09-02", "2026-09-02T10:00:00Z", { admin_id: "rev-1", automatica: true }),
          entrega("auto-dev", "2026-09-03", "2026-09-03T10:00:00Z", {
            admin_id: "admin-1",
            tipo: "devolucion",
            automatica: true,
          }),
        ],
        items: [item("manual", "p1", 10), item("auto", "p1", 4), item("auto-dev", "p1", 4)],
      }),
    );
    const porId = new Map(resultado.filas.map((f) => [f.id, f]));
    expect(porId.get("auto")).toMatchObject({ automatica: true, cargadaPor: null, tipo: "entrega" });
    expect(porId.get("auto-dev")).toMatchObject({ automatica: true, cargadaPor: null, tipo: "devolucion" });
    expect(porId.get("manual")?.automatica).toBe(false);
    expect(resultado.hayAutomaticas).toBe(true);
    expect(resultado.totalBotellas).toBe(10);
    expect(resultado.totalPorProducto).toEqual([{ productoNombre: "Aceite 500 ml", cantidad: 10 }]);
  });

  it("sin entregas: lista vacía y total 0", () => {
    expect(armarEntregasCoordinadora(datos({}))).toEqual({
      filas: [],
      totalBotellas: 0,
      hayAutomaticas: false,
      totalPorProducto: [],
    });
  });

  it("una entrega sin ítems queda con la lista vacía; un producto desconocido sale como '?'", () => {
    const { filas } = armarEntregasCoordinadora(
      datos({
        entregas: [entrega("e1", "2026-09-10", "2026-09-10T10:00:00Z"), entrega("e2", "2026-09-09", "2026-09-09T10:00:00Z")],
        items: [item("e2", "desconocido", 1)],
      }),
    );
    expect(filas[0].items).toEqual([]);
    expect(filas[1].items[0].productoNombre).toBe("?");
  });
});
