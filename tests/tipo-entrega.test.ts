import { describe, expect, it } from "vitest";

import { normalizarTipoEntrega } from "@/lib/dominio/tipo-entrega";

describe("normalizarTipoEntrega", () => {
  it("devolucion queda devolucion; todo lo demás es entrega", () => {
    expect(normalizarTipoEntrega("devolucion")).toBe("devolucion");
    expect(normalizarTipoEntrega("entrega")).toBe("entrega");
    expect(normalizarTipoEntrega("otra")).toBe("entrega");
    expect(normalizarTipoEntrega("")).toBe("entrega");
    expect(normalizarTipoEntrega(null)).toBe("entrega");
    expect(normalizarTipoEntrega(undefined)).toBe("entrega");
  });
});
