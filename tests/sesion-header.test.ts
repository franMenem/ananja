import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import type { VendedorConRol } from "@/lib/rol-vendedor";
import {
  codificarSesionHeader,
  decodificarSesionHeader,
  descartarHeaderEntrante,
  payloadSesionParaHeader,
  SESION_HEADER_NAME,
  type SesionHeaderPayload,
} from "@/lib/sesion-header";

/**
 * `lib/sesion-header.ts` — codificar/decodificar el header interno que el
 * proxy (`lib/supabase/middleware.ts`) usa para pasarle a los Server
 * Components el usuario y el vendedor ya resueltos
 * (`lib/sesion-actual.ts`). Casos clave: nombres con tildes/ñ (los headers
 * HTTP exigen Latin-1), header ausente/basura → `null` (cae al fallback
 * real), y que el header entrante del cliente se descarta siempre
 * (anti-spoofing).
 */

const PAYLOAD_ADMIN: SesionHeaderPayload = {
  userId: "u1",
  vendedor: { id: "v1", nombre: "María José Peña", activo: true, rol: "admin", revende: false },
};

describe("codificarSesionHeader / decodificarSesionHeader", () => {
  it("ida y vuelta preserva tildes y ñ en el nombre", () => {
    const codificado = codificarSesionHeader(PAYLOAD_ADMIN);
    expect(decodificarSesionHeader(codificado)).toEqual(PAYLOAD_ADMIN);
  });

  it("ida y vuelta con vendedor null (usuario sin fila válida)", () => {
    const payload: SesionHeaderPayload = { userId: "u2", vendedor: null };
    const codificado = codificarSesionHeader(payload);
    expect(decodificarSesionHeader(codificado)).toEqual(payload);
  });

  it("header ausente → null", () => {
    expect(decodificarSesionHeader(null)).toBeNull();
    expect(decodificarSesionHeader(undefined)).toBeNull();
    expect(decodificarSesionHeader("")).toBeNull();
  });

  it("header basura (no es base64url, o decodifica a algo que no es JSON) → null", () => {
    expect(decodificarSesionHeader("no es base64 válido !!! ###")).toBeNull();
    // Base64url válido, pero el contenido no es JSON.
    expect(decodificarSesionHeader(Buffer.from("no es json").toString("base64url"))).toBeNull();
  });

  it("JSON válido pero con forma equivocada (falta un campo, tipo incorrecto) → null", () => {
    const sinUserId = Buffer.from(JSON.stringify({ vendedor: null })).toString("base64url");
    expect(decodificarSesionHeader(sinUserId)).toBeNull();

    const vendedorIncompleto = Buffer.from(
      JSON.stringify({ userId: "u1", vendedor: { id: "v1", nombre: "Fran" } }),
    ).toString("base64url");
    expect(decodificarSesionHeader(vendedorIncompleto)).toBeNull();

    const activoComoString = Buffer.from(
      JSON.stringify({
        userId: "u1",
        vendedor: { id: "v1", nombre: "Fran", activo: "true", rol: "admin", revende: false },
      }),
    ).toString("base64url");
    expect(decodificarSesionHeader(activoComoString)).toBeNull();
  });

  it("un array o un string JSON válido pero no-objeto → null", () => {
    expect(decodificarSesionHeader(Buffer.from("[1,2,3]").toString("base64url"))).toBeNull();
    expect(decodificarSesionHeader(Buffer.from('"hola"').toString("base64url"))).toBeNull();
    expect(decodificarSesionHeader(Buffer.from("null").toString("base64url"))).toBeNull();
  });
});

describe("descartarHeaderEntrante", () => {
  it("un header de sesión que mande el cliente se descarta (anti-spoofing)", () => {
    const spoofeado = codificarSesionHeader({
      userId: "atacante",
      vendedor: { id: "v-atacante", nombre: "Atacante", activo: true, rol: "admin", revende: false },
    });
    const entrantes = new Headers({ [SESION_HEADER_NAME]: spoofeado, "user-agent": "test" });

    const limpios = descartarHeaderEntrante(entrantes);

    expect(limpios.get(SESION_HEADER_NAME)).toBeNull();
    expect(limpios.get("user-agent")).toBe("test");
  });

  it("sin el header de sesión en la request, no cambia nada", () => {
    const entrantes = new Headers({ "user-agent": "test" });
    const limpios = descartarHeaderEntrante(entrantes);
    expect(limpios.get("user-agent")).toBe("test");
    expect([...limpios.keys()]).toEqual([...entrantes.keys()]);
  });

  it("no muta el objeto Headers original", () => {
    const entrantes = new Headers({ [SESION_HEADER_NAME]: "algo" });
    descartarHeaderEntrante(entrantes);
    expect(entrantes.get(SESION_HEADER_NAME)).toBe("algo");
  });

  /**
   * Regresión: `lib/supabase/middleware.ts` reenvía al render los headers
   * del `NextRequest`, y `request.cookies.set(...)` (lo que hace el
   * `setAll` de Supabase cuando refresca el token) escribe DIRECTO sobre
   * `request.headers` — confirmado leyendo
   * `node_modules/next/dist/compiled/@edge-runtime/cookies/index.js`
   * (`RequestCookies.set` hace `this._headers.set("cookie", ...)` sobre el
   * mismo objeto `Headers` que le pasaron al construirlo). Por eso
   * `descartarHeaderEntrante` tiene que llamarse DESPUÉS de la mutación, a
   * partir de `request.headers` posta — nunca desde una copia guardada de
   * antes, que quedaría con la cookie vieja (el refresh token ya usado).
   */
  it("headers calculados DESPUÉS de un refresco de cookies (request.cookies.set) traen la cookie nueva y no el header de sesión que mandó el cliente", () => {
    const request = new NextRequest("https://ananja.example.com/tareas", {
      headers: {
        cookie: "sb-access-token=viejo",
        [SESION_HEADER_NAME]: "spoofeado-por-el-cliente",
        "user-agent": "test",
      },
    });

    // Una copia tomada ANTES de la mutación (el patrón viejo, buggy) queda
    // stale — este assert documenta el bug que este test previene.
    const copiaVieja = descartarHeaderEntrante(request.headers);

    // Simula lo que hace `setAll` cuando Supabase refresca el token.
    request.cookies.set("sb-access-token", "nuevo-refrescado");

    const headersFrescos = descartarHeaderEntrante(request.headers);

    expect(copiaVieja.get("cookie")).toBe("sb-access-token=viejo");
    expect(headersFrescos.get("cookie")).toBe("sb-access-token=nuevo-refrescado");
    expect(headersFrescos.get(SESION_HEADER_NAME)).toBeNull();
    expect(headersFrescos.get("user-agent")).toBe("test");
  });
});

describe("payloadSesionParaHeader", () => {
  const VENDEDOR: VendedorConRol = {
    id: "v1",
    nombre: "Fran",
    activo: true,
    rol: "admin",
    revende: false,
    email: null,
    creado_en: null,
    encargado_id: null,
    toma_directo: false,
    user_id: "u1",
  };

  it("vendedorResuelto=false → null SIEMPRE, no importa el vendedor (rutas exentas / mustChangePassword)", () => {
    expect(payloadSesionParaHeader("u1", false, null)).toBeNull();
    expect(payloadSesionParaHeader("u1", false, VENDEDOR)).toBeNull();
  });

  it("vendedorResuelto=true con vendedor → payload con el subconjunto de campos del header", () => {
    expect(payloadSesionParaHeader("u1", true, VENDEDOR)).toEqual({
      userId: "u1",
      vendedor: { id: "v1", nombre: "Fran", activo: true, rol: "admin", revende: false },
    });
  });

  it("vendedorResuelto=true con vendedor null (se consultó y no tiene fila) → payload con vendedor: null", () => {
    expect(payloadSesionParaHeader("u1", true, null)).toEqual({ userId: "u1", vendedor: null });
  });
});
