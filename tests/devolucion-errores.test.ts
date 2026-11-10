import { describe, expect, it } from "vitest";

import { ERRORES_DEVOLUCION } from "@/lib/dominio/devolucion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";

describe("ERRORES_DEVOLUCION (migración 0080)", () => {
  it("traduce LOTE_REQUERIDO y DEVOLUCION_EXCEDE_PEDIDO a español", () => {
    expect(traducirErrorRpc("LOTE_REQUERIDO", ERRORES_DEVOLUCION, "x")).toMatch(/pedido/);
    expect(traducirErrorRpc("DEVOLUCION_EXCEDE_PEDIDO", ERRORES_DEVOLUCION, "x")).toMatch(/más de las que tiene/);
  });
});
