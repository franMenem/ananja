import { describe, expect, it } from "vitest";

import { SECTORES, destinoDeSector, resolverNavegacion } from "@/lib/navegacion";

/** [ruta, sector, sección] esperados. */
const CASOS: [string, string, string][] = [
  ["/", "hoy", "resumen"],
  ["/tareas", "hoy", "para-hacer"],
  ["/tareas/transferir", "hoy", "para-hacer"],
  ["/stock", "botellas", "deposito"],
  ["/stock/nuevo", "botellas", "deposito"],
  ["/stock/lotes", "botellas", "pedidos"],
  ["/stock/lotes/abc", "botellas", "pedidos"],
  ["/stock/lotes/abc/pago", "botellas", "pedidos"],
  ["/stock/insumos", "botellas", "insumos"],
  ["/stock/insumos/factura", "botellas", "insumos"],
  ["/revendedores", "personas", "revendedores"],
  ["/revendedores/x/carga", "personas", "revendedores"],
  ["/clientes", "personas", "clientes"],
  ["/clientes/x", "personas", "clientes"],
  ["/clientes/x/editar", "personas", "clientes"],
  ["/material", "personas", "material"],
  ["/plata", "plata", "cuenta"],
  ["/plata/deudas", "plata", "cuenta"],
  ["/plata/deudas/nueva", "plata", "cuenta"],
  ["/plata/cuenta/mercado_pago", "plata", "cuenta"],
  ["/plata/en-manos/123", "plata", "cuenta"],
  ["/comprobantes", "plata", "ventas"],
  ["/comprobantes/nuevo", "plata", "ventas"],
  ["/gastos", "plata", "gastos"],
  ["/gastos/x", "plata", "gastos"],
  ["/ganancia", "plata", "ganancia"],
];

describe("resolverNavegacion", () => {
  it.each(CASOS)("%s resuelve a %s › %s", (ruta, sector, seccion) => {
    const ubicacion = resolverNavegacion(ruta);
    expect(ubicacion?.sector.id).toBe(sector);
    expect(ubicacion?.seccion.id).toBe(seccion);
  });

  it("\"/\" solo matchea exacto: no es prefijo de cualquier ruta", () => {
    expect(resolverNavegacion("/comprobantes")?.sector.id).not.toBe("hoy");
  });

  it("gana el prefijo más específico (/stock/lotes sobre /stock)", () => {
    expect(resolverNavegacion("/stock/lotes/1")?.seccion.id).toBe("pedidos");
    expect(resolverNavegacion("/stock/proveedor")?.seccion.id).toBe("deposito");
  });

  it("rutas fuera de cualquier sector devuelven null", () => {
    expect(resolverNavegacion("/cambiar-password")).toBeNull();
    expect(resolverNavegacion("/login")).toBeNull();
    expect(resolverNavegacion("/mi/ventas")).toBeNull();
  });

  it("hay cuatro lugares, en orden, y la sección /plata se llama Cuenta", () => {
    expect(SECTORES.map((s) => s.label)).toEqual(["Hoy", "Botellas", "Personas", "Plata"]);
    const plata = SECTORES.find((s) => s.id === "plata")!;
    expect(plata.secciones.map((s) => s.label)).toEqual(["Cuenta", "Ventas", "Gastos", "Ganancia"]);
  });

  it("cada id de sección es único, y no hay dos secciones con el mismo href", () => {
    const ids = new Set<string>();
    const hrefs = new Set<string>();
    for (const sector of SECTORES) {
      for (const seccion of sector.secciones) {
        expect(ids.has(seccion.id)).toBe(false);
        expect(hrefs.has(seccion.href)).toBe(false);
        ids.add(seccion.id);
        hrefs.add(seccion.href);
      }
    }
  });
});

describe("destinoDeSector", () => {
  it("cada sector lleva a su primera sección", () => {
    const destinos = Object.fromEntries(SECTORES.map((s) => [s.id, destinoDeSector(s)]));
    expect(destinos).toEqual({
      hoy: "/",
      botellas: "/stock",
      personas: "/revendedores",
      plata: "/plata",
    });
  });
});
