import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "11111111-1111-4111-8111-111111111111";
const estado = vi.hoisted(() => ({
  usuario: {} as Record<string, unknown>,
  fila: null as unknown,
  llamadas: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/invitaciones-server", async (original) => ({
  ...(await original<typeof import("@/lib/invitaciones-server")>()),
  exigirAdmin: async () => ({ id: "v-admin", user_id: "u-admin" }),
  urlSitioServidor: async () => "http://localhost",
}));
vi.mock("@/lib/supabase/admin", () => ({
  ServiceRoleNoConfigurada: class extends Error {},
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: estado.fila, error: null }) }) }),
      delete: () => ({
        eq: async () => {
          estado.llamadas.push("delete vendedores");
          return { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: estado.usuario }, error: null }),
        deleteUser: async () => {
          estado.llamadas.push("deleteUser");
          return { error: null };
        },
      },
    },
  }),
}));

import { cancelarInvitacion } from "@/app/(app)/revendedores/invitar/actions";

const invitado = {
  id: UID,
  email: "h@x.com",
  invited_at: "2026-11-01T10:00:00Z",
  app_metadata: { bienvenida_pendiente: true },
  user_metadata: { negocio: "ananja" },
};

beforeEach(() => {
  estado.llamadas = [];
  estado.fila = null;
});

describe("cancelarInvitacion con usuario sin fila", () => {
  it("con marca de esta app: borra", async () => {
    estado.usuario = invitado;
    expect((await cancelarInvitacion(UID)).ok).toBe(true);
    expect(estado.llamadas).toEqual(["delete vendedores", "deleteUser"]);
  });

  it("sin marca en app_metadata: rechaza y no borra nada", async () => {
    estado.usuario = { ...invitado, app_metadata: {} };
    expect((await cancelarInvitacion(UID)).ok).toBe(false);
    expect(estado.llamadas).toEqual([]);
  });

  it("de otro negocio: rechaza y no borra nada", async () => {
    estado.usuario = { ...invitado, user_metadata: { negocio: "germa" } };
    expect((await cancelarInvitacion(UID)).ok).toBe(false);
    expect(estado.llamadas).toEqual([]);
  });

  it("con marca pero que ya inició sesión: rechaza y no borra nada", async () => {
    estado.usuario = { ...invitado, last_sign_in_at: "2026-11-02T10:00:00Z" };
    expect((await cancelarInvitacion(UID)).ok).toBe(false);
    expect(estado.llamadas).toEqual([]);
  });
});
