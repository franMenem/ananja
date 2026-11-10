import { describe, expect, it, vi } from "vitest";

import { obtenerGasto } from "@/lib/data/gastos";

function supa(resultado: () => Promise<{ data: unknown; error: unknown }>) {
  const builder = { select: () => builder, eq: () => builder, maybeSingle: resultado };
  return { from: () => builder } as never;
}

describe("obtenerGasto", () => {
  it("distingue gasto existente, inexistente y error de carga", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fila = { id: "g1" };
    expect(await obtenerGasto(supa(async () => ({ data: fila, error: null })), "g1")).toEqual({
      estado: "listo",
      gasto: fila,
    });
    expect(await obtenerGasto(supa(async () => ({ data: null, error: null })), "g1")).toEqual({
      estado: "no_encontrado",
    });
    expect(await obtenerGasto(supa(async () => ({ data: null, error: { message: "x" } })), "g1")).toEqual({
      estado: "error",
    });
  });

  it("un corte de red (excepción) es error, no 'no encontrado'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await obtenerGasto(
      supa(async () => {
        throw new TypeError("Failed to fetch");
      }),
      "g1",
    );
    expect(r).toEqual({ estado: "error" });
  });
});
