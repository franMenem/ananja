import { describe, expect, it } from "vitest";

import type { CargaInput } from "@/lib/dominio/carga-revendedor";
import {
  busquedaDeCarga,
  busquedaDeEntrega,
  busquedaDePago,
  busquedaDeVentas,
  cuandoSeCargo,
  firmaBusqueda,
  hayQueBuscarParecidas,
  leerCargasParecidas,
  parametrosBusquedaParecidas,
  textoCargasParecidas,
  type CargaParecida,
} from "@/lib/dominio/cargas-parecidas";
import { formatCentavos } from "@/lib/money";

/**
 * Aviso de carga repetida (`buscar_cargas_parecidas`,
 * supabase/migrations/0045_ventas_borradas_y_duplicados.sql § 2).
 */

const HOY = "2026-09-15";

const entregaMartin: CargaParecida = {
  seccion: "entrega",
  id: "ei-1",
  productoNombre: "Botella 500 ml",
  cantidad: 13,
  montoCentavos: null,
  fecha: "2026-08-27",
  // 14:46 en Argentina (UTC−3)
  createdAt: "2026-09-15T17:46:00+00:00",
};

describe("cuandoSeCargo", () => {
  it("dice hoy / ayer / el día, con la hora de Argentina", () => {
    expect(cuandoSeCargo("2026-09-15T17:46:00Z", HOY)).toBe("hoy a las 14:46");
    expect(cuandoSeCargo("2026-09-14T12:05:00Z", HOY)).toBe("ayer a las 09:05");
    expect(cuandoSeCargo("2026-08-27T20:00:00Z", HOY)).toBe("el 27/08 a las 17:00");
  });

  it("usa el día de Argentina, no el de UTC", () => {
    // 01:30 UTC del 16 = 22:30 del 15 en Argentina
    expect(cuandoSeCargo("2026-09-16T01:30:00Z", HOY)).toBe("hoy a las 22:30");
  });
});

describe("textoCargasParecidas", () => {
  it("una entrega: el aviso completo en una frase", () => {
    expect(textoCargasParecidas([entregaMartin], HOY)).toEqual({
      resumen:
        "Ojo: ya hay cargada una entrega de 13 × Botella 500 ml con fecha 27/08 (hoy a las 14:46). ¿No la estás cargando dos veces?",
      detalle: [],
    });
  });

  it("un pago va en masculino y con el monto", () => {
    const pago: CargaParecida = {
      seccion: "pago",
      id: "r-1",
      productoNombre: null,
      cantidad: null,
      montoCentavos: 14_400_000,
      fecha: "2026-08-27",
      createdAt: "2026-09-14T12:05:00Z",
    };
    expect(textoCargasParecidas([pago], HOY).resumen).toBe(
      `Ojo: ya hay cargado un pago de ${formatCentavos(14_400_000)} con fecha 27/08 (ayer a las 09:05). ¿No lo estás cargando dos veces?`,
    );
  });

  it("varias: encabezado + una línea por cada una", () => {
    const venta: CargaParecida = { ...entregaMartin, seccion: "venta", id: "g-1" };
    const aviso = textoCargasParecidas([entregaMartin, venta], HOY);
    expect(aviso.resumen).toBe("Ojo: ya hay cargado algo muy parecido. ¿No lo estás cargando dos veces?");
    expect(aviso.detalle).toEqual([
      "Una entrega de 13 × Botella 500 ml con fecha 27/08 (hoy a las 14:46)",
      "Una venta de 13 × Botella 500 ml con fecha 27/08 (hoy a las 14:46)",
    ]);
  });
});

describe("firmaBusqueda / hayQueBuscarParecidas", () => {
  const entrega = busquedaDeEntrega("2026-08-27", [
    { productoId: "p500", loteId: "l1", cantidad: 13 },
    { productoId: "p250", loteId: null, cantidad: 4 },
  ]);

  it("no depende del orden de las filas", () => {
    const alReves = busquedaDeEntrega("2026-08-27", [
      { productoId: "p250", loteId: null, cantidad: 4 },
      { productoId: "p500", loteId: "l1", cantidad: 13 },
    ]);
    expect(firmaBusqueda(alReves)).toBe(firmaBusqueda(entrega));
  });

  it("no cuenta el id de la venta (cambia después de guardar)", () => {
    const a = busquedaDeVentas("2026-08-27", [{ productoId: "p500", cantidad: 13, grupoId: "g1" }]);
    const b = busquedaDeVentas("2026-08-27", [{ productoId: "p500", cantidad: 13, grupoId: "g2" }]);
    expect(firmaBusqueda(a)).toBe(firmaBusqueda(b));
  });

  it("busca si no se aceptó nada, y no vuelve a preguntar lo ya aceptado", () => {
    expect(hayQueBuscarParecidas(entrega, null)).toBe(true);
    expect(hayQueBuscarParecidas(entrega, firmaBusqueda(entrega))).toBe(false);
  });

  it("después de editar (otra fecha, cantidad, lote o monto) vuelve a buscar", () => {
    const aceptada = firmaBusqueda(entrega);
    const otraFecha = busquedaDeEntrega("2026-08-28", entrega.entrega!.items);
    const otraCantidad = busquedaDeEntrega("2026-08-27", [
      { productoId: "p500", loteId: "l1", cantidad: 12 },
      { productoId: "p250", loteId: null, cantidad: 4 },
    ]);
    const otroLote = busquedaDeEntrega("2026-08-27", [
      { productoId: "p500", loteId: "l2", cantidad: 13 },
      { productoId: "p250", loteId: null, cantidad: 4 },
    ]);
    expect(hayQueBuscarParecidas(otraFecha, aceptada)).toBe(true);
    expect(hayQueBuscarParecidas(otraCantidad, aceptada)).toBe(true);
    expect(hayQueBuscarParecidas(otroLote, aceptada)).toBe(true);
    expect(
      hayQueBuscarParecidas(busquedaDePago("2026-08-27", 100), firmaBusqueda(busquedaDePago("2026-08-27", 200))),
    ).toBe(true);
  });

  it("sin nada para comparar no pregunta", () => {
    expect(hayQueBuscarParecidas(busquedaDeEntrega("2026-08-27", []), null)).toBe(false);
    expect(hayQueBuscarParecidas({ entrega: null, ventas: null, pago: null }, null)).toBe(false);
  });
});

describe("busquedaDeCarga", () => {
  const input: CargaInput = {
    entrega: {
      fecha: "2026-08-27",
      permitirNegativo: false,
      filas: [
        { productoId: "p500", loteId: "l1", cantidad: 13, costoCentavos: 500_000, sugeridoCentavos: null },
        { productoId: "p250", loteId: "l1", cantidad: 0, costoCentavos: 300_000, sugeridoCentavos: null },
      ],
    },
    ventas: {
      fecha: "2026-08-27",
      medioPago: null,
      filas: [
        { productoId: "p500", cantidad: 13, precioVentaCentavos: 800_000, sinPrecio: false, loteId: null },
        { productoId: "p250", cantidad: 0, precioVentaCentavos: null, sinPrecio: false, loteId: null },
      ],
    },
    pago: { fecha: "2026-08-27", montoCentavos: 6_500_000, medioPago: "efectivo", via: "encargado", nota: "x" },
  };

  it("toma solo las filas con cantidad, igual que armarPedidoCarga", () => {
    expect(busquedaDeCarga(input)).toEqual({
      entrega: { fecha: "2026-08-27", items: [{ productoId: "p500", loteId: "l1", cantidad: 13 }] },
      ventas: { fecha: "2026-08-27", items: [{ productoId: "p500", cantidad: 13 }] },
      pago: { fecha: "2026-08-27", montoCentavos: 6_500_000 },
    });
  });

  it("un pago sin monto no se compara", () => {
    const sinMonto = { ...input, pago: { ...input.pago!, montoCentavos: null } };
    expect(busquedaDeCarga(sinMonto).pago).toBeNull();
  });

  it("la nota o el precio no cambian la firma", () => {
    const otraNota: CargaInput = {
      ...input,
      pago: { ...input.pago!, nota: "otra" },
      ventas: {
        ...input.ventas!,
        filas: input.ventas!.filas.map((f) => ({ ...f, precioVentaCentavos: 1 })),
      },
    };
    expect(firmaBusqueda(busquedaDeCarga(otraNota))).toBe(firmaBusqueda(busquedaDeCarga(input)));
  });
});

describe("parametrosBusquedaParecidas", () => {
  it("arma los parámetros del RPC (claves en snake_case, null = sección no incluida)", () => {
    const b = busquedaDeVentas("2026-08-27", [{ productoId: "p500", cantidad: 13, grupoId: "g1" }]);
    expect(parametrosBusquedaParecidas("v1", b)).toEqual({
      p_vendedor_id: "v1",
      p_entrega: null,
      p_ventas: { fecha: "2026-08-27", items: [{ producto_id: "p500", cantidad: 13, grupo_id: "g1" }] },
      p_pago: null,
    });
  });

  it("manda la clave de la carga unificada solo si hay", () => {
    const b = busquedaDePago("2026-08-27", 100);
    expect(parametrosBusquedaParecidas("v1", b, "clave-1")).toMatchObject({
      p_pago: { fecha: "2026-08-27", monto_centavos: 100 },
      p_clave: "clave-1",
    });
    expect(parametrosBusquedaParecidas("v1", b)).not.toHaveProperty("p_clave");
    const e = busquedaDeEntrega("2026-08-27", [{ productoId: "p500", loteId: null, cantidad: 1 }]);
    expect(parametrosBusquedaParecidas("v1", e).p_entrega).toEqual({
      fecha: "2026-08-27",
      items: [{ producto_id: "p500", lote_id: null, cantidad: 1 }],
    });
  });
});

describe("leerCargasParecidas", () => {
  it("lee la respuesta y descarta filas mal formadas", () => {
    expect(
      leerCargasParecidas([
        {
          seccion: "entrega",
          id: "ei-1",
          producto_id: "p500",
          producto_nombre: "Botella 500 ml",
          cantidad: 13,
          monto_centavos: null,
          fecha: "2026-08-27",
          created_at: "2026-09-15T17:46:00+00:00",
        },
        { seccion: "otra", id: "x", fecha: "2026-08-27", created_at: "2026-09-15T17:46:00Z" },
        { seccion: "pago", id: 3 },
        null,
      ]),
    ).toEqual([entregaMartin]);
  });

  it("sin datos o con algo que no es una lista: nada", () => {
    expect(leerCargasParecidas(null)).toEqual([]);
    expect(leerCargasParecidas({})).toEqual([]);
  });
});
