import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...rest }, children),
    useLinkStatus: () => ({ pending: false }),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/ferias",
}));

import { DetalleFeria } from "@/components/ferias/detalle-feria";
import { FeriaForm } from "@/components/ferias/feria-form";
import { ListaFerias } from "@/components/ferias/lista-ferias";
import {
  ordenarFerias,
  revendedorasDisponibles,
  sePuedeCerrarFeria,
  sePuedeQuitar,
  totalesFeria,
} from "@/lib/dominio/feria-admin";

const part = (o: Record<string, unknown>) => ({
  feria_id: "f1",
  vendedor_id: "v1",
  vendedor_nombre: "Ana",
  estado: "pendiente",
  cerrada_at: null,
  entregadas: 0,
  devueltas: 0,
  degustadas: 0,
  degustadas_carga: 0,
  degustadas_cierre: 0,
  vendidas: 0,
  faltan: 0,
  total_vendido_centavos: 0,
  costo_centavos: 0,
  efectivo_centavos: 0,
  mercado_pago_centavos: 0,
  banco_centavos: 0,
  ...o,
});

describe("lógica de feria-admin", () => {
  it("ordena abiertas primero y por fecha descendente", () => {
    const orden = ordenarFerias([
      { id: "a", estado: "cerrada", fecha: "2026-11-01" },
      { id: "b", estado: "abierta", fecha: "2026-10-01" },
      { id: "c", estado: "abierta", fecha: "2026-11-05" },
    ]).map((f) => f.id);
    expect(orden).toEqual(["c", "b", "a"]);
  });

  it("suma los totales y cuenta pendientes", () => {
    const t = totalesFeria([
      part({ entregadas: 10, vendidas: 6, devueltas: 2, degustadas: 1, faltan: 1, total_vendido_centavos: 600 }),
      part({ vendedor_id: "v2", estado: "cerrada", entregadas: 5, vendidas: 5, total_vendido_centavos: 500, efectivo_centavos: 300, banco_centavos: 200 }),
    ]);
    expect(t).toMatchObject({
      participantes: 2,
      pendientes: 1,
      cerradas: 1,
      entregadas: 15,
      vendidas: 11,
      devueltas: 2,
      degustadas: 1,
      faltan: 1,
      totalVendidoCentavos: 1100,
      declaradoCentavos: 500,
    });
  });

  it("solo se quita a un pendiente sin botellas", () => {
    expect(sePuedeQuitar({ estado: "pendiente", entregadas: 0 })).toBe(true);
    expect(sePuedeQuitar({ estado: "pendiente", entregadas: 3 })).toBe(false);
    expect(sePuedeQuitar({ estado: "cerrada", entregadas: 0 })).toBe(false);
  });

  it("la feria se cierra solo abierta y sin pendientes", () => {
    expect(sePuedeCerrarFeria("abierta", 0)).toBe(true);
    expect(sePuedeCerrarFeria("abierta", 1)).toBe(false);
    expect(sePuedeCerrarFeria("cerrada", 0)).toBe(false);
  });

  it("revendedoras disponibles excluye a las que ya están", () => {
    expect(
      revendedorasDisponibles([{ id: "v1" }, { id: "v2" }], [{ vendedor_id: "v1" }]).map((r) => r.id),
    ).toEqual(["v2"]);
  });
});

describe("pantallas de ferias", () => {
  it("lista vacía", () => {
    expect(renderToStaticMarkup(<ListaFerias ferias={[]} />)).toContain("Todavía no armaste ninguna feria.");
  });

  it("lista con ferias: nombre, participantes y estado, abiertas primero", () => {
    const base = { admin_id: null, created_at: "", nota: null, lugar: "Plaza" };
    const html = renderToStaticMarkup(
      <ListaFerias
        ferias={[
          { ...base, id: "1", nombre: "Vieja", estado: "cerrada", fecha: "2026-10-01", participantes: 1 },
          { ...base, id: "2", nombre: "Nueva", estado: "abierta", fecha: "2026-11-01", participantes: 3 },
        ]}
      />,
    );
    expect(html.indexOf("Nueva")).toBeLessThan(html.indexOf("Vieja"));
    expect(html).toContain("3 participantes");
    expect(html).toContain("1 participante");
    expect(html).toContain("Abierta");
    expect(html).toContain("Cerrada");
    expect(html).toContain('href="/ferias/2"');
  });

  it("detalle con una participante pendiente y una que cerró", () => {
    const html = renderToStaticMarkup(
      <DetalleFeria
        feria={{ id: "f1", admin_id: null, created_at: "", nota: null, lugar: "Plaza", nombre: "Feria X", estado: "abierta", fecha: "2026-11-01" }}
        participantes={[
          part({ entregadas: 10, vendidas: 0, faltan: 10 }),
          part({ vendedor_id: "v2", vendedor_nombre: "Beba", estado: "cerrada", entregadas: 4, vendidas: 4, total_vendido_centavos: 400000, efectivo_centavos: 400000 }),
        ]}
        productosPorPersona={{ v1: [{ feria_id: "f1", vendedor_id: "v1", producto_id: "p1", producto_nombre: "500 ml", entregadas: 10, vendidas: 0, devueltas: 0, degustadas: 0, degustadas_carga: 0, degustadas_cierre: 0, precio_feria_centavos: 1000 }] }}
        revendedoras={[{ id: "v1", nombre: "Ana" }, { id: "v2", nombre: "Beba" }, { id: "v3", nombre: "Cata" }]}
      />,
    );
    expect(html).toContain("Feria X");
    expect(html).toContain("Pendiente");
    expect(html).toContain("Cerró");
    expect(html).toContain("Cargar botellas");
    expect(html).toContain('href="/ferias/f1/entregar/v1"');
    expect(html).toContain('href="/ferias/f1/cerrar/v1"');
    expect(html).toContain("Reabrir");
    expect(html).toContain("Cerrar feria");
    expect(html).toContain("500 ml");
    expect(html).toContain("1 de 2 cerraron");
    // Ana tiene botellas: no se puede quitar.
    expect(html).not.toContain(">Quitar<");
  });

  it("detalle de feria cerrada ofrece reabrir la feria", () => {
    const html = renderToStaticMarkup(
      <DetalleFeria
        feria={{ id: "f1", admin_id: null, created_at: "", nota: null, lugar: null, nombre: "Feria X", estado: "cerrada", fecha: "2026-11-01" }}
        participantes={[]}
        productosPorPersona={{}}
        revendedoras={[]}
      />,
    );
    expect(html).toContain("Reabrir feria");
    expect(html).not.toContain("Sumar participante</");
  });

  it("formulario de feria con una fila de precio por producto", () => {
    const html = renderToStaticMarkup(
      <FeriaForm
        productos={[{ id: "p1", nombre: "500 ml" }, { id: "p2", nombre: "250 ml" }]}
        feriaId="f1"
        inicial={{ nombre: "Feria X", fecha: "2026-11-01", lugar: "Plaza", nota: null, precios: { p1: 150000 } }}
      />,
    );
    expect(html).toContain("Precio de feria por producto");
    expect(html).toContain("500 ml");
    expect(html).toContain("250 ml");
    expect(html).toContain("1.500,00");
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Feria X");
  });
});
