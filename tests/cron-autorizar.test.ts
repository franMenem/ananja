import { describe, expect, it } from "vitest";

import { autorizarCron } from "@/lib/cron/autorizar";

describe("autorizarCron", () => {
  it("autoriza cuando el header coincide con el secreto esperado", () => {
    expect(autorizarCron("Bearer el-secreto", "el-secreto")).toBe(true);
  });

  it("rechaza sin header", () => {
    expect(autorizarCron(null, "el-secreto")).toBe(false);
    expect(autorizarCron(undefined, "el-secreto")).toBe(false);
  });

  it("rechaza sin secreto configurado (aunque el header sea válido)", () => {
    expect(autorizarCron("Bearer lo-que-sea", null)).toBe(false);
    expect(autorizarCron("Bearer lo-que-sea", undefined)).toBe(false);
    expect(autorizarCron("Bearer lo-que-sea", "")).toBe(false);
  });

  it("rechaza un secreto incorrecto", () => {
    expect(autorizarCron("Bearer otro-secreto", "el-secreto")).toBe(false);
  });

  it("rechaza longitudes distintas sin tirar (timingSafeEqual exige igual longitud)", () => {
    expect(autorizarCron("Bearer corto", "un-secreto-mucho-mas-largo")).toBe(
      false,
    );
    expect(autorizarCron("Bearer un-header-mucho-mas-largo", "corto")).toBe(
      false,
    );
  });

  it("rechaza sin el prefijo Bearer", () => {
    expect(autorizarCron("el-secreto", "el-secreto")).toBe(false);
  });

  it("es sensible a mayúsculas/minúsculas", () => {
    expect(autorizarCron("Bearer El-Secreto", "el-secreto")).toBe(false);
  });
});
