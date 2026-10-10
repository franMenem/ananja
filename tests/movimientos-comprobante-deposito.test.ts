import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { cargarMovimientosPlata } from "@/lib/data/plata";
import type { Database } from "@/lib/types";

/**
 * `cargarMovimientosPlata` (`lib/data/plata.ts`) con un Supabase de mentira:
 * los depósitos que nacieron del aviso de una coordinadora
 * (`depositos_informados`, 0057/0071) muestran "lo avisó desde la app · lo
 * confirmó {admin}" y, si el aviso tiene comprobante, un link firmado.
 * Todos los nombres y montos son inventados.
 */

type Fila = Record<string, unknown>;

/** `from(tabla)` devuelve un constructor de consultas encadenable y "esperable":
 * cualquier método devuelve el mismo objeto y, al esperarlo, resuelve con las
 * filas de esa tabla. Anota las tablas que se consultaron. */
function fakeSupabase(
  tablas: Record<string, Fila[]>,
  firmar: (paths: string[]) => unknown = (paths) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://firmada/${path}`, error: null })),
    error: null,
  }),
) {
  const consultadas: string[] = [];
  const createSignedUrls = vi.fn(async (paths: string[]) => firmar(paths));
  const from = vi.fn((tabla: string) => {
    consultadas.push(tabla);
    const resultado = { data: tablas[tabla] ?? [], error: null };
    const builder: Record<string, unknown> = {};
    const encadenable = new Proxy(builder, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolver: (v: unknown) => unknown) => Promise.resolve(resultado).then(resolver);
        }
        return () => encadenable;
      },
    });
    return encadenable;
  });
  const supabase = { from, storage: { from: () => ({ createSignedUrls }) } } as unknown as SupabaseClient<Database>;
  return { supabase, createSignedUrls, consultadas };
}

const VENDEDORES = [
  { id: "ana", nombre: "Ana" },
  { id: "bruno", nombre: "Bruno" },
];

function deposito(id: string, extra: Fila = {}): Fila {
  return {
    id,
    monto_centavos: 50_000_00,
    medio_pago: "mercado_pago",
    fecha: "2026-10-01",
    created_at: "2026-10-01T15:00:00Z",
    nota: null,
    tenedor_id: "ana",
    vendedor_id: "bruno",
    ...extra,
  };
}

const todo = { tipo: "todo", limite: 10 } as const;

describe("cargarMovimientosPlata — depósitos con aviso y comprobante", () => {
  it("un depósito avisado con comprobante dice quién confirmó y lleva el link firmado", async () => {
    const path = "coordinadores/ana-id/2026/10/a.jpg";
    const { supabase, createSignedUrls } = fakeSupabase({
      vendedores: VENDEDORES,
      depositos_cuenta: [deposito("d1", { nota: "Depósito informado desde la app" })],
      depositos_informados: [{ deposito_id: "d1", imagen_path: path, resuelto_por: "bruno" }],
    });

    const [fila] = await cargarMovimientosPlata(supabase, todo);

    expect(fila.detalle).toBe("lo avisó desde la app · lo confirmó Bruno");
    expect(fila.comprobanteUrl).toBe(`https://firmada/${path}`);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("un depósito cargado a mano sigue diciendo 'lo anotó' y no tiene link", async () => {
    const { supabase, createSignedUrls } = fakeSupabase({
      vendedores: VENDEDORES,
      depositos_cuenta: [deposito("d1")],
    });

    const [fila] = await cargarMovimientosPlata(supabase, todo);

    expect(fila.detalle).toBe("lo anotó Bruno");
    expect(fila.comprobanteUrl).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("un aviso viejo sin comprobante muestra el detalle nuevo pero no firma nada", async () => {
    const { supabase, createSignedUrls } = fakeSupabase({
      vendedores: VENDEDORES,
      depositos_cuenta: [deposito("d1")],
      depositos_informados: [{ deposito_id: "d1", imagen_path: null, resuelto_por: "bruno" }],
    });

    const [fila] = await cargarMovimientosPlata(supabase, todo);

    expect(fila.detalle).toBe("lo avisó desde la app · lo confirmó Bruno");
    expect(fila.comprobanteUrl).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("solo firma los comprobantes de las filas que devuelve (respeta el límite)", async () => {
    const { supabase, createSignedUrls } = fakeSupabase({
      vendedores: VENDEDORES,
      depositos_cuenta: [
        deposito("viejo", { fecha: "2026-09-01", created_at: "2026-09-01T15:00:00Z" }),
        deposito("nuevo", { fecha: "2026-10-05", created_at: "2026-10-05T15:00:00Z" }),
      ],
      depositos_informados: [
        { deposito_id: "viejo", imagen_path: "coordinadores/ana-id/2026/09/viejo.jpg", resuelto_por: "bruno" },
        { deposito_id: "nuevo", imagen_path: "coordinadores/ana-id/2026/10/nuevo.jpg", resuelto_por: "bruno" },
      ],
    });

    const filas = await cargarMovimientosPlata(supabase, { tipo: "todo", limite: 1 });

    expect(filas.map((f) => f.id)).toEqual(["nuevo"]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0]).toEqual(["coordinadores/ana-id/2026/10/nuevo.jpg"]);
  });

  it("si falla la firma, la fila sale sin link y la lista no se rompe", async () => {
    const { supabase } = fakeSupabase(
      {
        vendedores: VENDEDORES,
        depositos_cuenta: [deposito("d1")],
        depositos_informados: [{ deposito_id: "d1", imagen_path: "coordinadores/ana-id/2026/10/a.jpg", resuelto_por: "bruno" }],
      },
      () => {
        throw new Error("sin red");
      },
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const filas = await cargarMovimientosPlata(supabase, todo);

    expect(filas).toHaveLength(1);
    expect(filas[0].comprobanteUrl).toBeNull();
    error.mockRestore();
  });

  it("si Storage devuelve error de firma, la fila sale sin link", async () => {
    const { supabase } = fakeSupabase(
      {
        vendedores: VENDEDORES,
        depositos_cuenta: [deposito("d1")],
        depositos_informados: [{ deposito_id: "d1", imagen_path: "coordinadores/ana-id/2026/10/a.jpg", resuelto_por: "bruno" }],
      },
      () => ({ data: null, error: { message: "boom" } }),
    );

    const [fila] = await cargarMovimientosPlata(supabase, todo);

    expect(fila.comprobanteUrl).toBeNull();
  });
});
