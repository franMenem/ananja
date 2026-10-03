import { describe, expect, it } from "vitest";

import { esEndpointPushPermitido } from "@/lib/push-endpoint";

/**
 * `esEndpointPushPermitido` (`lib/push-endpoint.ts`) — SSRF (auditoría de
 * seguridad 2026-09-20): `push_subscriptions.endpoint` lo manda el cliente
 * y el server hace un POST directo a esa URL (`webpush.sendNotification`),
 * así que solo puede ser un endpoint de push real de los cuatro
 * navegadores que importan acá.
 */
describe("esEndpointPushPermitido", () => {
  it("acepta fcm.googleapis.com (Chrome/Android)", () => {
    expect(esEndpointPushPermitido("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
  });

  it("acepta updates.push.services.mozilla.com (Firefox)", () => {
    expect(
      esEndpointPushPermitido("https://updates.push.services.mozilla.com/wpush/v2/abc"),
    ).toBe(true);
  });

  it("acepta el dominio de Mozilla sin subdominio también", () => {
    expect(esEndpointPushPermitido("https://push.services.mozilla.com/wpush/v2/abc")).toBe(true);
  });

  it("acepta *.notify.windows.com (Edge)", () => {
    expect(esEndpointPushPermitido("https://db5.notify.windows.com/w/abc")).toBe(true);
  });

  it("acepta web.push.apple.com (Safari)", () => {
    expect(esEndpointPushPermitido("https://web.push.apple.com/QAA123")).toBe(true);
  });

  it("rechaza http (no https)", () => {
    expect(esEndpointPushPermitido("http://fcm.googleapis.com/fcm/send/abc123")).toBe(false);
  });

  it("rechaza una IP literal", () => {
    expect(esEndpointPushPermitido("https://192.168.1.1/fcm/send/abc")).toBe(false);
    expect(esEndpointPushPermitido("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("rechaza localhost", () => {
    expect(esEndpointPushPermitido("https://localhost/fcm/send/abc")).toBe(false);
    expect(esEndpointPushPermitido("https://localhost:3000/fcm/send/abc")).toBe(false);
  });

  it("rechaza userinfo embebido en la URL", () => {
    expect(esEndpointPushPermitido("https://user:pass@fcm.googleapis.com/fcm/send/abc")).toBe(
      false,
    );
  });

  it("rechaza un puerto explícito, aunque el host sea válido", () => {
    expect(esEndpointPushPermitido("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
  });

  it("rechaza un sufijo falso (subdominio del atacante, no del servicio)", () => {
    expect(
      esEndpointPushPermitido("https://evilpush.apple.com.atacante.com/fcm/send/abc"),
    ).toBe(false);
  });

  it("rechaza un prefijo que imita el dominio real sin punto separador", () => {
    expect(esEndpointPushPermitido("https://xfcm.googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("fcm.googleapis.com no admite subdominios (a diferencia de los otros tres)", () => {
    expect(esEndpointPushPermitido("https://foo.fcm.googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("rechaza un dominio totalmente ajeno", () => {
    expect(esEndpointPushPermitido("https://atacante.com/fcm/send/abc")).toBe(false);
  });

  it("rechaza un string que no es una URL", () => {
    expect(esEndpointPushPermitido("no-es-una-url")).toBe(false);
    expect(esEndpointPushPermitido("")).toBe(false);
  });
});
