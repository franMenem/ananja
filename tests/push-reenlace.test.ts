import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { olvidarReenlacePush, reenlazarSuscripcionPush } from "@/lib/push-client";

/** El reenlace silencioso (F7) se hace una vez por día por suscripción. */

const ENDPOINT = "https://push.ejemplo.test/abc";

function montarNavegador(guardado: Record<string, string>, fetchMock: ReturnType<typeof vi.fn>) {
  const localStorage = {
    getItem: (k: string) => guardado[k] ?? null,
    setItem: (k: string, v: string) => void (guardado[k] = v),
    removeItem: (k: string) => void delete guardado[k],
  };
  const suscripcion = { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }) };
  vi.stubGlobal("window", { Notification: {}, PushManager: {}, localStorage });
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => suscripcion } }) },
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("reenlazarSuscripcionPush", () => {
  let guardado: Record<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    guardado = {};
    fetchMock = vi.fn(async () => ({ ok: true }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    montarNavegador(guardado, fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("la primera vez hace el POST y guarda la marca", async () => {
    await reenlazarSuscripcionPush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(guardado)).toHaveLength(1);
  });

  it("dentro del día no vuelve a hacerlo", async () => {
    await reenlazarSuscripcionPush();
    vi.setSystemTime(new Date("2026-10-27T11:00:00Z"));
    await reenlazarSuscripcionPush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pasado el día, o si cambió la suscripción, vuelve a hacerlo", async () => {
    await reenlazarSuscripcionPush();
    vi.setSystemTime(new Date("2026-10-27T12:00:01Z"));
    await reenlazarSuscripcionPush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const clave = Object.keys(guardado)[0];
    guardado[clave] = JSON.stringify({ endpoint: "https://push.ejemplo.test/otra", en: Date.now() });
    await reenlazarSuscripcionPush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("si el POST falla no guarda la marca, y al cerrar sesión se olvida", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await reenlazarSuscripcionPush();
    expect(Object.keys(guardado)).toHaveLength(0);
    await reenlazarSuscripcionPush();
    expect(Object.keys(guardado)).toHaveLength(1);
    olvidarReenlacePush();
    expect(Object.keys(guardado)).toHaveLength(0);
  });

  it("sin localStorage igual funciona (como antes)", async () => {
    vi.stubGlobal("window", { Notification: {}, PushManager: {}, localStorage: { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} } });
    await reenlazarSuscripcionPush();
    await reenlazarSuscripcionPush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
