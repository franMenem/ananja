import { describe, expect, it } from "vitest";

import {
  entregasComoMovimientos,
  fusionarMovimientos,
  LIMITE_MOVIMIENTOS_VISIBLES,
  primerGrupoSinPrecio,
  ventasComoMovimientos,
  type MovimientoEntrega,
  type MovimientoVenta,
} from "@/lib/dominio/movimientos-revendedor";

function entrega(fecha: string, createdAt: string, id = `e-${fecha}`): MovimientoEntrega {
  return {
    tipo: "entrega",
    id,
    fecha,
    createdAt,
    items: [{ productoId: "p1", cantidad: 1, costoCentavos: 100, costoLoteCentavos: 90 }],
  };
}

function venta(
  fecha: string,
  createdAt: string,
  overrides: Partial<MovimientoVenta> = {},
): MovimientoVenta {
  return {
    tipo: "venta",
    id: `v-${fecha}-${createdAt}`,
    grupoId: `g-${fecha}-${createdAt}`,
    fecha,
    createdAt,
    productoId: "p1",
    cantidad: 1,
    precioVentaCentavos: 500,
    medioPago: null,
    cargadaPorAdmin: false,
    ...overrides,
  };
}

describe("fusionarMovimientos", () => {
  it("intercala entregas y ventas por fecha, más reciente primero", () => {
    const resultado = fusionarMovimientos(
      [entrega("2026-09-10", "2026-09-10T10:00:00Z")],
      [venta("2026-09-14", "2026-09-14T10:00:00Z"), venta("2026-09-02", "2026-09-02T10:00:00Z")],
    );
    expect(resultado.map((m) => m.fecha)).toEqual(["2026-09-14", "2026-09-10", "2026-09-02"]);
  });

  it("con la misma fecha, desempata por created_at más reciente primero", () => {
    const resultado = fusionarMovimientos(
      [entrega("2026-09-10", "2026-09-10T08:00:00Z", "e1")],
      [venta("2026-09-10", "2026-09-10T12:00:00Z", { id: "v1" })],
    );
    expect(resultado.map((m) => m.id)).toEqual(["v1", "e1"]);
  });

  it("recorta al límite pedido", () => {
    const ventas = Array.from({ length: 5 }, (_, i) =>
      venta(`2026-09-${String(i + 1).padStart(2, "0")}`, `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
    );
    expect(fusionarMovimientos([], ventas, 3)).toHaveLength(3);
  });

  it("por default recorta a LIMITE_MOVIMIENTOS_VISIBLES", () => {
    const ventas = Array.from({ length: LIMITE_MOVIMIENTOS_VISIBLES + 5 }, (_, i) =>
      venta(`v${i}`, `2026-09-01T${String(i).padStart(2, "0")}:00:00Z`),
    );
    expect(fusionarMovimientos([], ventas)).toHaveLength(LIMITE_MOVIMIENTOS_VISIBLES);
  });

  it("con un límite muy alto (todo el hilo) devuelve todos los movimientos", () => {
    const ventas = Array.from({ length: LIMITE_MOVIMIENTOS_VISIBLES + 5 }, (_, i) =>
      venta(`v${i}`, `2026-09-01T${String(i).padStart(2, "0")}:00:00Z`),
    );
    expect(fusionarMovimientos([], ventas, Number.POSITIVE_INFINITY)).toHaveLength(
      LIMITE_MOVIMIENTOS_VISIBLES + 5,
    );
  });

  it("sin movimientos, devuelve una lista vacía", () => {
    expect(fusionarMovimientos([], [])).toEqual([]);
  });
});

describe("primerGrupoSinPrecio", () => {
  it("devuelve el grupoId de la primera venta sin precio (la más reciente del hilo)", () => {
    const movimientos = fusionarMovimientos(
      [],
      [
        venta("2026-09-14", "2026-09-14T10:00:00Z", { grupoId: "con-precio" }),
        venta("2026-09-10", "2026-09-10T10:00:00Z", { grupoId: "sin-precio-vieja", precioVentaCentavos: null }),
        venta("2026-09-12", "2026-09-12T10:00:00Z", { grupoId: "sin-precio-nueva", precioVentaCentavos: null }),
      ],
    );
    expect(primerGrupoSinPrecio(movimientos)).toBe("sin-precio-nueva");
  });

  it("null si no hay ninguna venta sin precio", () => {
    const movimientos = fusionarMovimientos([], [venta("2026-09-14", "2026-09-14T10:00:00Z")]);
    expect(primerGrupoSinPrecio(movimientos)).toBeNull();
  });

  it("null con el hilo vacío", () => {
    expect(primerGrupoSinPrecio([])).toBeNull();
  });

  it("encuentra una venta sin precio vieja, fuera de LIMITE_MOVIMIENTOS_VISIBLES, si se le pasa el hilo completo", () => {
    const recientes = Array.from({ length: LIMITE_MOVIMIENTOS_VISIBLES }, (_, i) =>
      venta(`2026-09-${String(30 - i).padStart(2, "0")}`, `2026-09-${String(30 - i).padStart(2, "0")}T00:00:00Z`),
    );
    const vieja = venta("2026-01-01", "2026-01-01T00:00:00Z", {
      grupoId: "sin-precio-vieja",
      precioVentaCentavos: null,
    });
    const completo = fusionarMovimientos([], [...recientes, vieja], Number.POSITIVE_INFINITY);
    // La venta vieja quedó bien al final, fuera de lo que se vería sin
    // "Ver todos" — igual se encuentra porque se busca en el hilo completo.
    expect(completo.length).toBeGreaterThan(LIMITE_MOVIMIENTOS_VISIBLES);
    expect(primerGrupoSinPrecio(completo)).toBe("sin-precio-vieja");
  });
});

describe("entregasComoMovimientos", () => {
  it("agrupa los ítems de cada entrega adentro de su movimiento", () => {
    const [m1, m2] = entregasComoMovimientos(
      [
        { id: "e1", fecha: "2026-09-10", created_at: "2026-09-10T10:00:00Z", tipo: "entrega" },
        { id: "e2", fecha: "2026-09-05", created_at: "2026-09-05T10:00:00Z", tipo: "devolucion" },
      ],
      [
        {
          entrega_id: "e1",
          producto_id: "p1",
          cantidad: 7,
          costo_ananja_unitario_centavos: 600_000,
          costo_lote_unitario_centavos: 500_000,
        },
        {
          entrega_id: "e1",
          producto_id: "p2",
          cantidad: 3,
          costo_ananja_unitario_centavos: null,
          costo_lote_unitario_centavos: null,
        },
        {
          entrega_id: "e2",
          producto_id: "p1",
          cantidad: 2,
          costo_ananja_unitario_centavos: null,
          costo_lote_unitario_centavos: null,
        },
      ],
    );
    expect(m1).toEqual({
      tipo: "entrega",
      id: "e1",
      fecha: "2026-09-10",
      createdAt: "2026-09-10T10:00:00Z",
      items: [
        { productoId: "p1", cantidad: 7, costoCentavos: 600_000, costoLoteCentavos: 500_000 },
        { productoId: "p2", cantidad: 3, costoCentavos: null, costoLoteCentavos: null },
      ],
    });
    expect(m2.tipo).toBe("devolucion");
    expect(m2.items).toEqual([
      { productoId: "p1", cantidad: 2, costoCentavos: null, costoLoteCentavos: null },
    ]);
  });

  it("una entrega sin ítems queda con la lista vacía", () => {
    const [m1] = entregasComoMovimientos(
      [{ id: "e1", fecha: "2026-09-10", created_at: "2026-09-10T10:00:00Z", tipo: "entrega" }],
      [],
    );
    expect(m1.items).toEqual([]);
  });
});

describe("ventasComoMovimientos", () => {
  it("suma las filas con el mismo grupo_id (una venta que salió de dos entregas)", () => {
    const movimientos = ventasComoMovimientos([
      {
        id: "v1",
        grupo_id: "g1",
        fecha: "2026-09-14",
        created_at: "2026-09-14T10:00:00Z",
        producto_id: "p1",
        cantidad: 2,
        precio_venta_centavos: 27_000,
        medio_pago: "mercado_pago",
        registrada_por: null,
      },
      {
        id: "v2",
        grupo_id: "g1",
        fecha: "2026-09-14",
        created_at: "2026-09-14T10:00:00Z",
        producto_id: "p1",
        cantidad: 1,
        precio_venta_centavos: 27_000,
        medio_pago: "mercado_pago",
        registrada_por: null,
      },
    ]);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].cantidad).toBe(3);
  });

  it("registrada_por != null marca cargadaPorAdmin", () => {
    const [m] = ventasComoMovimientos([
      {
        id: "v1",
        grupo_id: "g1",
        fecha: "2026-09-14",
        created_at: "2026-09-14T10:00:00Z",
        producto_id: "p1",
        cantidad: 1,
        precio_venta_centavos: null,
        medio_pago: null,
        registrada_por: "admin1",
      },
    ]);
    expect(m.cargadaPorAdmin).toBe(true);
    expect(m.precioVentaCentavos).toBeNull();
  });
});
