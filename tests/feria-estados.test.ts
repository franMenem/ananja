import { describe, expect, it } from "vitest";

import { ESTADO_FERIA_ABIERTA, feriaAbierta, participacionCerrada } from "@/lib/dominio/feria-admin";

describe("estados de feria y participación", () => {
  it("feriaAbierta", () => {
    expect(feriaAbierta("abierta")).toBe(true);
    expect(feriaAbierta("cerrada")).toBe(false);
    expect(feriaAbierta(null)).toBe(false);
    expect(feriaAbierta(undefined)).toBe(false);
    expect(ESTADO_FERIA_ABIERTA).toBe("abierta");
  });
  it("participacionCerrada", () => {
    expect(participacionCerrada("cerrada")).toBe(true);
    expect(participacionCerrada("pendiente")).toBe(false);
    expect(participacionCerrada(null)).toBe(false);
  });
});
