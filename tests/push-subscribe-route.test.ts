import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/push/subscribe` (`app/api/push/subscribe/route.ts`) con un
 * cliente de Supabase simulado — hallazgo F7 (migración 0076): la
 * suscripción queda atada a su dueño por `guardar_suscripcion_push`.
 */

type Respuesta = { error: { code?: string; message?: string } | null };

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  esAdmin: true,
  rpc: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));

vi.mock("@/lib/rol-vendedor", () => ({
  esAdminAutenticado: async () => mocks.esAdmin,
}));

import { POST } from "@/app/api/push/subscribe/route";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const KEYS = { p256dh: "p256", auth: "auth" };

function pedir(body: unknown) {
  return POST(
    new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const FUNCION_INEXISTENTE: Respuesta = { error: { code: "PGRST202", message: "not found" } };

beforeEach(() => {
  mocks.user = { id: "user-1" };
  mocks.esAdmin = true;
  mocks.rpc.mockReset().mockResolvedValue({ data: { id: "s1" }, error: null });
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.delete.mockReset();
  mocks.from.mockReset().mockImplementation(() => ({
    insert: mocks.insert,
    delete: () => ({ eq: mocks.delete }),
  }));
});

describe("POST /api/push/subscribe", () => {
  it("camino rpc: una sola llamada a guardar_suscripcion_push, sin tocar la tabla", async () => {
    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS });

    expect(res.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("guardar_suscripcion_push", {
      p_endpoint: ENDPOINT,
      p_keys: KEYS,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("el body nunca define el dueño: ni vendedor_id ni nada extra llega a la rpc", async () => {
    await pedir({ endpoint: ENDPOINT, keys: KEYS, vendedor_id: "otra-persona", p_vendedor_id: "x" });

    const [, params] = mocks.rpc.mock.calls[0];
    expect(Object.keys(params).sort()).toEqual(["p_endpoint", "p_keys"]);
  });

  it("re-suscribir un endpoint existente es una sola rpc (sin delete+insert)", async () => {
    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS, reenlazar: true });

    expect(res.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("función inexistente: 500, sin escribir la tabla directo (ya no hay camino de respaldo)", async () => {
    mocks.rpc.mockResolvedValue(FUNCION_INEXISTENTE);

    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS });

    expect(res.status).toBe(500);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("NO_AUTORIZADO de la función: 403, sin tocar la tabla", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "NO_AUTORIZADO" } });

    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS });

    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("SUSCRIPCION_INVALIDA de la función: 400, sin tocar la tabla", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "SUSCRIPCION_INVALIDA" } });

    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS });

    expect(res.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("otro error de la función: 500, sin tocar la tabla ni siquiera con reenlazar", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "XX000", message: "boom" } });

    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS, reenlazar: true });

    expect(res.status).toBe(500);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin sesión: 401, sin llamar a nada", async () => {
    mocks.user = null;

    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS });

    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("no admin: 403, sin llamar a nada", async () => {
    mocks.esAdmin = false;

    const res = await pedir({ endpoint: ENDPOINT, keys: KEYS });

    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("suscripción incompleta: 400", async () => {
    const res = await pedir({ endpoint: ENDPOINT, keys: { p256dh: "x" } });

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("endpoint no permitido (SSRF): 400, sin llamar a nada", async () => {
    const res = await pedir({ endpoint: "http://169.254.169.254/x", keys: KEYS });

    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
