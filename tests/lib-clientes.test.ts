import { describe, expect, it } from "vitest";

import { armarFilasClientes } from "@/lib/dominio/clientes";

describe("armarFilasClientes — sin compras ni deuda", () => {
  it("da total 0 y última compra null", () => {
    const rows = armarFilasClientes(
      [{ id: "c1", nombre: "Almacén San José", telefono: null }],
      [],
      [],
    );
    expect(rows).toEqual([
      {
        id: "c1",
        nombre: "Almacén San José",
        telefono: null,
        totalCentavos: 0,
        ultimaCompra: null,
        deudaCentavos: 0,
      },
    ]);
  });
});

describe("armarFilasClientes — agrega total y última compra", () => {
  it("suma el total comprado y se queda con la fecha más reciente", () => {
    const rows = armarFilasClientes(
      [{ id: "c1", nombre: "Cliente 1", telefono: null }],
      [
        { cliente_id: "c1", monto_centavos: 100000, fecha: "2026-09-01" },
        { cliente_id: "c1", monto_centavos: 50000, fecha: "2026-09-10" },
        { cliente_id: "otro", monto_centavos: 999999, fecha: "2026-09-15" },
      ],
      [],
    );
    expect(rows[0].totalCentavos).toBe(150000);
    expect(rows[0].ultimaCompra).toBe("2026-09-10");
  });
});

describe("armarFilasClientes — orden", () => {
  it("deudores primero (deuda descendente), después alfabético", () => {
    const clientes = [
      { id: "c1", nombre: "Zeta", telefono: null },
      { id: "c2", nombre: "Alfa", telefono: null },
      { id: "c3", nombre: "Beta", telefono: null },
    ];
    const deudas = [
      { cliente_id: "c1", deuda_centavos: 0 },
      { cliente_id: "c2", deuda_centavos: 50000 },
      { cliente_id: "c3", deuda_centavos: 100000 },
    ];
    const rows = armarFilasClientes(clientes, [], deudas);
    expect(rows.map((r) => r.nombre)).toEqual(["Beta", "Alfa", "Zeta"]);
  });

  it("sin deuda, ordena alfabético", () => {
    const clientes = [
      { id: "c1", nombre: "Zeta", telefono: null },
      { id: "c2", nombre: "Alfa", telefono: null },
    ];
    const rows = armarFilasClientes(clientes, [], []);
    expect(rows.map((r) => r.nombre)).toEqual(["Alfa", "Zeta"]);
  });
});
