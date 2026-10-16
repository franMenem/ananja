import { describe, expect, it } from "vitest";

import {
  esFuncionPushSinMigrar,
  filtrarSuscripcionesDeAdmins,
  tieneColumnaDueno,
} from "@/lib/push-suscripciones";

/**
 * Lógica pura de las suscripciones de push con dueño (hallazgo F7,
 * `supabase/migrations/0076_push_subscriptions_dueno.sql`).
 */
describe("esFuncionPushSinMigrar", () => {
  it("reconoce función inexistente en PostgREST y en Postgres", () => {
    expect(esFuncionPushSinMigrar({ code: "PGRST202" })).toBe(true);
    expect(esFuncionPushSinMigrar({ code: "42883" })).toBe(true);
  });

  it("no confunde otros errores con base sin migrar", () => {
    expect(esFuncionPushSinMigrar({ code: "P0001" })).toBe(false);
    expect(esFuncionPushSinMigrar({ code: "23505" })).toBe(false);
    expect(esFuncionPushSinMigrar({})).toBe(false);
    expect(esFuncionPushSinMigrar(null)).toBe(false);
    expect(esFuncionPushSinMigrar(undefined)).toBe(false);
  });
});

describe("tieneColumnaDueno", () => {
  it("es true si alguna fila trae la clave, aunque sea null", () => {
    expect(tieneColumnaDueno([{ endpoint: "a", vendedor_id: null }])).toBe(true);
    expect(tieneColumnaDueno([{ endpoint: "a" }, { endpoint: "b", vendedor_id: "v1" }])).toBe(
      true,
    );
  });

  it("es false si ninguna fila trae la clave (base sin migrar) o no hay filas", () => {
    expect(tieneColumnaDueno([{ endpoint: "a" }, { endpoint: "b" }])).toBe(false);
    expect(tieneColumnaDueno([])).toBe(false);
  });
});

describe("filtrarSuscripcionesDeAdmins", () => {
  const admins = new Set(["admin-1", "admin-2"]);

  it("deja solo las filas cuyo dueño es un admin activo", () => {
    const filas = [
      { endpoint: "a", vendedor_id: "admin-1" },
      { endpoint: "b", vendedor_id: "ex-admin" },
      { endpoint: "c", vendedor_id: "admin-2" },
    ];

    expect(filtrarSuscripcionesDeAdmins(filas, admins).map((f) => f.endpoint)).toEqual([
      "a",
      "c",
    ]);
  });

  it("descarta las filas sin dueño todavía", () => {
    const filas = [
      { endpoint: "a", vendedor_id: null },
      { endpoint: "b", vendedor_id: "admin-1" },
    ];

    expect(filtrarSuscripcionesDeAdmins(filas, admins).map((f) => f.endpoint)).toEqual(["b"]);
  });

  it("sin admins activos no queda nadie", () => {
    const filas = [{ endpoint: "a", vendedor_id: "admin-1" }];

    expect(filtrarSuscripcionesDeAdmins(filas, new Set())).toEqual([]);
  });

  it("con la base sin migrar (sin clave vendedor_id) devuelve todas, como antes", () => {
    const filas = [{ endpoint: "a" }, { endpoint: "b" }];

    expect(filtrarSuscripcionesDeAdmins(filas, new Set())).toEqual(filas);
  });
});
