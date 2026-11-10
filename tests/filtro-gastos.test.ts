import { describe, expect, it } from "vitest";

import { categoriaVigente, parsearFiltroGastos, serializarFiltroGastos } from "@/lib/dominio/filtro-gastos";

const q = (s: string) => new URLSearchParams(s);

describe("filtro de /gastos en la URL", () => {
  it("lee categoría y mes", () => {
    expect(parsearFiltroGastos(q("c=abc-123&m=2026-11"))).toEqual({ categoriaId: "abc-123", mes: "2026-11" });
  });
  it("tolera valores inválidos o ausentes", () => {
    expect(parsearFiltroGastos(q("m=2026-13&c=a%20b%3Cx"))).toEqual({ categoriaId: "", mes: "" });
    expect(parsearFiltroGastos(q("m=noviembre"))).toEqual({ categoriaId: "", mes: "" });
    expect(parsearFiltroGastos(null)).toEqual({ categoriaId: "", mes: "" });
  });
  it("serializa solo lo que no es default y vuelve a leerse igual", () => {
    expect(serializarFiltroGastos({ categoriaId: "", mes: "" })).toBe("");
    const f = { categoriaId: "k1", mes: "2026-10" };
    expect(parsearFiltroGastos(q(serializarFiltroGastos(f)))).toEqual(f);
  });

  it("categoriaVigente ignora un id que no existe, pero solo si las categorías cargaron", () => {
    const cats = [{ id: "k1" }];
    expect(categoriaVigente("k1", cats)).toBe("k1");
    expect(categoriaVigente("borrada", cats)).toBe("");
    expect(categoriaVigente("borrada", null)).toBe("borrada");
    expect(categoriaVigente("", cats)).toBe("");
  });
});
