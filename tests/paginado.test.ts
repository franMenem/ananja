import { describe, expect, it } from "vitest";

import { leerTodasLasPaginas } from "@/lib/paginado";

function fuente(total: number, fallarEn?: number) {
  const pedidos: [number, number][] = [];
  const pagina = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta]);
    if (fallarEn === desde) return { data: null, error: { message: "boom" } };
    const filas = Array.from({ length: Math.max(0, Math.min(hasta, total - 1) - desde + 1) }, (_, i) => desde + i);
    return { data: filas, error: null };
  };
  return { pagina, pedidos };
}

describe("leerTodasLasPaginas", () => {
  it("sigue pidiendo mientras la página venga llena", async () => {
    const { pagina, pedidos } = fuente(25);
    const { data, error } = await leerTodasLasPaginas(pagina, 10);
    expect(error).toBeNull();
    expect(data).toHaveLength(25);
    expect(pedidos).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("un total múltiplo exacto pide una página vacía extra y termina", async () => {
    const { pagina, pedidos } = fuente(20);
    const { data } = await leerTodasLasPaginas(pagina, 10);
    expect(data).toHaveLength(20);
    expect(pedidos).toHaveLength(3);
  });

  it("devuelve el error de una página", async () => {
    const { pagina } = fuente(25, 10);
    const { data, error } = await leerTodasLasPaginas(pagina, 10);
    expect(error).toEqual({ message: "boom" });
    expect(data).toHaveLength(10);
  });
});
