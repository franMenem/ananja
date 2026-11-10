import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { borrarCuentaSinAcceso, listarInvitacionesPendientes } from "@/lib/invitaciones-server";

type Err = { code?: string; status?: number } | null;

/** Cliente admin falso: registra el orden de las llamadas y devuelve los errores configurados. */
function adminFalso(opciones: { fila?: Err; auth?: Err; filas?: unknown[]; usuarios?: Partial<User>[] }) {
  const llamadas: string[] = [];
  const admin = {
    from: () => ({
      delete: () => ({
        eq: async () => {
          llamadas.push("delete vendedores");
          return { error: opciones.fila ?? null };
        },
      }),
      select: () => ({ in: async () => ({ data: opciones.filas ?? [], error: null }) }),
    }),
    auth: {
      admin: {
        deleteUser: async () => {
          llamadas.push("deleteUser");
          return { error: opciones.auth ?? null };
        },
        listUsers: async () => ({ data: { users: opciones.usuarios ?? [] }, error: null }),
      },
    },
  };
  return { admin: admin as never, llamadas };
}

describe("borrarCuentaSinAcceso (cancelar cuenta)", () => {
  it("camino feliz: primero la fila, después Auth", async () => {
    const { admin, llamadas } = adminFalso({});
    expect(await borrarCuentaSinAcceso(admin, "u1")).toEqual({ ok: true });
    expect(llamadas).toEqual(["delete vendedores", "deleteUser"]);
  });

  it("falla el paso 1 (23503, tiene movimientos): no toca Auth", async () => {
    const { admin, llamadas } = adminFalso({ fila: { code: "23503" } });
    expect(await borrarCuentaSinAcceso(admin, "u1")).toEqual({ ok: false, paso: "fila", code: "23503" });
    expect(llamadas).toEqual(["delete vendedores"]);
  });

  it("falla el paso 2: informa el paso y NO reinserta la fila (no hay insert en el cliente)", async () => {
    const { admin, llamadas } = adminFalso({ auth: { code: "unexpected_failure", status: 500 } });
    expect(await borrarCuentaSinAcceso(admin, "u1")).toEqual({
      ok: false,
      paso: "auth",
      code: "unexpected_failure",
    });
    expect(llamadas).toEqual(["delete vendedores", "deleteUser"]);
  });

  it("reintento tras fallo parcial: sin fila (borrar 0 filas no es error) y Auth ahora anda", async () => {
    const { admin, llamadas } = adminFalso({});
    expect(await borrarCuentaSinAcceso(admin, "u1")).toEqual({ ok: true });
    expect(llamadas).toEqual(["delete vendedores", "deleteUser"]);
  });

  it("reintento cuando Auth ya había borrado al usuario (respuesta perdida): cuenta como hecho", async () => {
    for (const auth of [{ code: "user_not_found", status: 404 }, { status: 404 }]) {
      const { admin } = adminFalso({ auth });
      expect(await borrarCuentaSinAcceso(admin, "u1")).toEqual({ ok: true });
    }
  });
});

describe("listarInvitacionesPendientes con restos de una cancelación cortada", () => {
  const invitado = (id: string): Partial<User> => ({
    id,
    email: `${id}@x.com`,
    invited_at: "2026-11-01T10:00:00Z",
    created_at: "2026-11-01T10:00:00Z",
    email_confirmed_at: undefined,
    last_sign_in_at: undefined,
    user_metadata: { display_name: "Ana", negocio: "ananja" },
    app_metadata: {},
  });

  it("lista al usuario sin fila (para poder terminar de cancelarlo), no al dado de baja", async () => {
    const { admin } = adminFalso({
      usuarios: [
        { ...invitado("sin-fila"), app_metadata: { bienvenida_pendiente: true } },
        invitado("de-baja"),
        invitado("normal"),
      ],
      filas: [
        { id: "v2", nombre: "Baja", rol: "revendedor", user_id: "de-baja", activo: false },
        { id: "v3", nombre: "Normal", rol: "admin", user_id: "normal", activo: true },
      ],
    });
    const lista = await listarInvitacionesPendientes(admin);
    expect(lista.map((p) => p.userId).sort()).toEqual(["normal", "sin-fila"]);
    const huerfano = lista.find((p) => p.userId === "sin-fila")!;
    expect(huerfano).toMatchObject({ nombre: "Ana", rol: "pendiente", tipo: "mail", puedeCancelar: true });
  });
});

describe("huérfanos (usuario de Auth sin fila): solo los de un alta de esta app", () => {
  const base = {
    invited_at: "2026-11-01T10:00:00Z",
    created_at: "2026-11-01T10:00:00Z",
    email: "h@x.com",
  };
  const conMarcaInvitacion = {
    ...base,
    id: "h1",
    app_metadata: { bienvenida_pendiente: true },
    user_metadata: { display_name: "H", negocio: "ananja" },
  };
  const sinMarca = { ...conMarcaInvitacion, id: "h2", app_metadata: {} };
  const marcaSoloEnUserMetadata = {
    ...conMarcaInvitacion,
    id: "h3",
    app_metadata: {},
    user_metadata: { display_name: "H", negocio: "ananja", bienvenida_pendiente: true },
  };
  const otroNegocio = { ...conMarcaInvitacion, id: "h4", user_metadata: { negocio: "germa" } };
  const sinNegocioExplicito = { ...conMarcaInvitacion, id: "h5", user_metadata: { display_name: "H" } };
  const yaEntro = { ...conMarcaInvitacion, id: "h6", last_sign_in_at: "2026-11-02T10:00:00Z" };

  it("con marca: se lista y es cancelable", async () => {
    const { admin } = adminFalso({ usuarios: [conMarcaInvitacion] });
    const lista = await listarInvitacionesPendientes(admin);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ userId: "h1", puedeCancelar: true });
  });

  it("sin marca de app_metadata, con la marca solo en user_metadata, de otro negocio o sin negocio explícito: no se lista", async () => {
    const { admin } = adminFalso({
      usuarios: [sinMarca, marcaSoloEnUserMetadata, otroNegocio, sinNegocioExplicito],
    });
    expect(await listarInvitacionesPendientes(admin)).toEqual([]);
  });

  it("con marca pero que ya inició sesión: no es cancelable", async () => {
    const { admin } = adminFalso({ usuarios: [yaEntro] });
    const lista = await listarInvitacionesPendientes(admin);
    expect(lista.every((p) => p.puedeCancelar === false)).toBe(true);
  });
});
