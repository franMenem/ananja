import { describe, expect, it } from "vitest";

import { hayQueRecontar } from "@/components/tareas-badge";

describe("badge de tareas: cuándo recontar al navegar", () => {
  it("no recuenta si el último dato (contado o informado por Hoy / Para hacer) tiene menos de 2 minutos", () => {
    expect(hayQueRecontar(1_000_000 + 119_999, 1_000_000)).toBe(false);
  });
  it("recuenta pasados los 2 minutos", () => {
    expect(hayQueRecontar(1_000_000 + 120_000, 1_000_000)).toBe(true);
  });
  it("recuenta si nunca hubo un dato", () => {
    expect(hayQueRecontar(Date.now(), 0)).toBe(true);
  });
});
