import { describe, expect, it } from "vitest";

import { esTipoNotificacionPush } from "@/lib/dominio/notificaciones";

describe("esTipoNotificacionPush", () => {
  it("acepta solo stock_bajo y gasto_nuevo", () => {
    expect(esTipoNotificacionPush("stock_bajo")).toBe(true);
    expect(esTipoNotificacionPush("gasto_nuevo")).toBe(true);
    expect(esTipoNotificacionPush("pago_revendedor")).toBe(false);
    expect(esTipoNotificacionPush(undefined)).toBe(false);
  });
});
