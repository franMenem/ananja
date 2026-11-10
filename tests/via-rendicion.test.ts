import { describe, expect, it } from "vitest";

import { parsearViaRendicion } from "@/lib/dominio/plata";

describe("parsearViaRendicion", () => {
  it("deja pasar las vías conocidas", () => {
    expect(parsearViaRendicion("encargado")).toBe("encargado");
    expect(parsearViaRendicion("directo_cuenta")).toBe("directo_cuenta");
    expect(parsearViaRendicion("cliente_directo")).toBe("cliente_directo");
  });
  it("un valor desconocido se trata como directo a la cuenta", () => {
    expect(parsearViaRendicion("otra")).toBe("directo_cuenta");
    expect(parsearViaRendicion("")).toBe("directo_cuenta");
  });
});
