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

  it("acepta las formas reales de endpoint con token percent-encoded, query y ':'", () => {
    expect(
      esEndpointPushPermitido("https://fcm.googleapis.com/fcm/send/cXyZ-_12:APA91bH_k-9"),
    ).toBe(true);
    expect(
      esEndpointPushPermitido("https://db5.notify.windows.com/w/?token=BQYAAAB%2fA%2bb%3d%3d"),
    ).toBe(true);
    expect(
      esEndpointPushPermitido("https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB-_x"),
    ).toBe(true);
    expect(esEndpointPushPermitido("https://web.push.apple.com/QAA-123_xyz")).toBe(true);
  });
});

/**
 * Diferencial de parsers (auditoría de seguridad 2026-10-11): `web-push`
 * conecta al hostname que saca `url.parse` (legacy) del string crudo, no al
 * que ve `new URL` (WHATWG). Un host "permitido" para uno puede ser otro
 * para el otro: ninguna de estas formas tiene que pasar.
 */
describe("esEndpointPushPermitido: bypass por diferencial de parsers", () => {
  it.each([
    ["punto y coma", "https://atacante.example;.push.apple.com/x"],
    ["comilla simple", "https://atacante.example'.push.apple.com/x"],
    ["comilla doble", 'https://atacante.example".push.apple.com/x'],
    ["llave de apertura", "https://atacante.example{.push.apple.com/x"],
    ["llave de cierre", "https://atacante.example}.push.apple.com/x"],
    ["barra invertida", "https://atacante.example\\.push.apple.com/x"],
    ["barra invertida + userinfo", "https://atacante.example\\@fcm.googleapis.com/x"],
    ["barra invertida tras el host válido", "https://fcm.googleapis.com\\@atacante.example/x"],
    ["tab", "https://atacante.example\t.push.apple.com/x"],
    ["salto de línea", "https://atacante.example\n.push.apple.com/x"],
    ["retorno de carro", "https://atacante.example\r.push.apple.com/x"],
    ["espacio", "https://atacante.example .push.apple.com/x"],
    ["tab dentro del host permitido", "https://fcm.googleapis.com\t.atacante.example/x"],
    ["@ con el host permitido como userinfo", "https://fcm.googleapis.com@atacante.example/x"],
    ["@ con userinfo y dominio permitido", "https://x.push.apple.com@atacante.example/x"],
    ["# antes del @", "https://atacante.example#@fcm.googleapis.com/x"],
    ["? antes del @", "https://atacante.example?@fcm.googleapis.com/x"],
    ["espacio inicial", " https://fcm.googleapis.com/fcm/send/abc"],
    ["tab final", "https://fcm.googleapis.com/fcm/send/abc\t"],
    ["salto de línea en el path", "https://fcm.googleapis.com/fcm/send/a\nbc"],
    ["caracteres no ASCII", "https://fcm.googleapis.com/fcm/send/ñ"],
  ])("rechaza %s", (_nombre, endpoint) => {
    expect(esEndpointPushPermitido(endpoint)).toBe(false);
  });

  it("sigue aceptando un :443 explícito (puerto por defecto de https, mismo destino)", () => {
    expect(esEndpointPushPermitido("https://fcm.googleapis.com:443/fcm/send/abc")).toBe(true);
  });

  it("sigue rechazando cualquier otro puerto explícito", () => {
    expect(esEndpointPushPermitido("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
    expect(esEndpointPushPermitido("https://fcm.googleapis.com:80/fcm/send/abc")).toBe(false);
  });
});
