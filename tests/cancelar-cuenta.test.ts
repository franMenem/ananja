import { describe, expect, it } from "vitest";

import {
  esObjetivoGestionable,
  MARCA_ALTA,
  mensajeErrorBorrarCuenta,
  motivoNoCancelable,
  TEXTOS_CANCELAR,
  tipoPendiente,
} from "@/lib/dominio/invitaciones";

const marca = { [MARCA_ALTA.clave]: MARCA_ALTA.valor };
const temporalSinUsar = {
  app_metadata: marca,
  user_metadata: { must_change_password: true },
  email_confirmed_at: "2026-09-15T10:00:00Z",
  last_sign_in_at: null,
};
const invitadaSinUsar = { invited_at: "2026-09-15T10:00:00Z", email_confirmed_at: null, last_sign_in_at: null };

describe("tipoPendiente (qué entra en 'Pendientes de entrar')", () => {
  it("invitación por mail sin terminar → mail", () => {
    expect(tipoPendiente(invitadaSinUsar)).toBe("mail");
  });

  it("cuenta con contraseña temporal de Sumar persona que nunca entró → temporal", () => {
    expect(tipoPendiente(temporalSinUsar)).toBe("temporal");
  });

  it("cuenta temporal que ya entró, cuenta creada a mano o cuenta normal → no va", () => {
    expect(tipoPendiente({ ...temporalSinUsar, last_sign_in_at: "2026-09-15T11:00:00Z" })).toBeNull();
    expect(tipoPendiente({ user_metadata: { must_change_password: true } })).toBeNull();
    expect(tipoPendiente({ email_confirmed_at: "2026-09-15T10:00:00Z" })).toBeNull();
  });
});

describe("motivoNoCancelable (guard de cancelar)", () => {
  it("temporal: solo si es de Sumar persona y nunca entró", () => {
    expect(motivoNoCancelable("temporal", temporalSinUsar)).toBeNull();
    expect(
      motivoNoCancelable("temporal", { ...temporalSinUsar, last_sign_in_at: "2026-09-15T11:00:00Z" }),
    ).toMatch(/no se puede cancelar/);
    // Cambió la contraseña (flag bajado): ya es una cuenta real.
    expect(motivoNoCancelable("temporal", { ...temporalSinUsar, user_metadata: {} })).not.toBeNull();
    // Creada a mano (sin marca en app_metadata), aunque tenga el flag.
    expect(motivoNoCancelable("temporal", { ...temporalSinUsar, app_metadata: {} })).not.toBeNull();
  });

  it("temporal: una invitación por mail no se cancela por la vía de cuentas temporales", () => {
    expect(motivoNoCancelable("temporal", invitadaSinUsar)).not.toBeNull();
  });

  it("mail: solo si nunca usó el link", () => {
    expect(motivoNoCancelable("mail", invitadaSinUsar)).toBeNull();
    expect(
      motivoNoCancelable("mail", { ...invitadaSinUsar, email_confirmed_at: "2026-09-15T11:00:00Z" }),
    ).toMatch(/ya usó el link/);
    expect(motivoNoCancelable("mail", temporalSinUsar)).not.toBeNull();
  });
});

describe("esObjetivoGestionable", () => {
  const fila = { id: "v-1", activo: true };

  it("de este negocio, con fila activa y distinta de quien llama", () => {
    expect(esObjetivoGestionable({ deEsteNegocio: true, fila, callerVendedorId: "v-admin" })).toBe(true);
  });

  it("nunca a uno mismo, de otro negocio, sin fila o dado de baja", () => {
    expect(esObjetivoGestionable({ deEsteNegocio: true, fila, callerVendedorId: "v-1" })).toBe(false);
    expect(esObjetivoGestionable({ deEsteNegocio: false, fila, callerVendedorId: "v-admin" })).toBe(false);
    expect(esObjetivoGestionable({ deEsteNegocio: true, fila: null, callerVendedorId: "v-admin" })).toBe(false);
    expect(
      esObjetivoGestionable({ deEsteNegocio: true, fila: { ...fila, activo: false }, callerVendedorId: "v-admin" }),
    ).toBe(false);
  });
});

describe("mensajeErrorBorrarCuenta", () => {
  it("FK 23503 = tiene movimientos o es encargado", () => {
    expect(mensajeErrorBorrarCuenta("23503", "temporal")).toMatch(/movimientos/);
    expect(mensajeErrorBorrarCuenta("23503", "mail")).toMatch(/movimientos/);
  });

  it("cualquier otro error → mensaje genérico según el tipo", () => {
    expect(mensajeErrorBorrarCuenta("42501", "temporal")).toBe(TEXTOS_CANCELAR.temporal.error);
    expect(mensajeErrorBorrarCuenta(undefined, "mail")).toBe(TEXTOS_CANCELAR.mail.error);
  });
});
