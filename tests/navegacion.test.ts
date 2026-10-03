import { describe, expect, it } from "vitest";

import {
  SECTORES,
  destinoDeSector,
  resolverNavegacion,
} from "@/lib/navegacion";

describe("resolverNavegacion", () => {
  it("resuelve \"/\" exacto a Inicio, sin sección", () => {
    const ubicacion = resolverNavegacion("/");
    expect(ubicacion?.sector.id).toBe("inicio");
    expect(ubicacion?.seccion).toBeNull();
  });

  it("no matchea Inicio por prefijo (\"/\" no es prefijo de cualquier ruta)", () => {
    const ubicacion = resolverNavegacion("/comprobantes");
    expect(ubicacion?.sector.id).not.toBe("inicio");
  });

  it("\"/plata/deudas\" resuelve al sector Plata CON la sección \"Plata\" (es su pantalla madre, igual que \"/stock/nuevo\" cae bajo Stock)", () => {
    const ubicacion = resolverNavegacion("/plata/deudas");
    expect(ubicacion?.sector.id).toBe("plata");
    expect(ubicacion?.seccion?.id).toBe("plata");
  });

  it("\"/plata/cuenta/mercado_pago\" (medio dinámico) resuelve al sector Plata CON la sección \"Plata\"", () => {
    const ubicacion = resolverNavegacion("/plata/cuenta/mercado_pago");
    expect(ubicacion?.sector.id).toBe("plata");
    expect(ubicacion?.seccion?.id).toBe("plata");
  });

  it("\"/plata/en-manos/123\" resuelve al sector Plata CON la sección \"Plata\"", () => {
    const ubicacion = resolverNavegacion("/plata/en-manos/123");
    expect(ubicacion?.sector.id).toBe("plata");
    expect(ubicacion?.seccion?.id).toBe("plata");
  });

  it("\"/plata\" resuelve al sector Plata CON la sección \"Plata\" (match exacto: la sección puntual gana el empate con el sector, así se ve marcada al caer ahí desde el tab)", () => {
    const ubicacion = resolverNavegacion("/plata");
    expect(ubicacion?.sector.id).toBe("plata");
    expect(ubicacion?.seccion?.id).toBe("plata");
  });

  it("\"/stock/lotes/123\" resuelve a Lotes, no a Stock", () => {
    const ubicacion = resolverNavegacion("/stock/lotes/123");
    expect(ubicacion?.sector.id).toBe("produccion");
    expect(ubicacion?.seccion?.id).toBe("lotes");
  });

  it("\"/stock\" resuelve a Stock", () => {
    const ubicacion = resolverNavegacion("/stock");
    expect(ubicacion?.seccion?.id).toBe("stock");
  });

  it("\"/stock/insumos\" resuelve a Insumos, no a Stock", () => {
    const ubicacion = resolverNavegacion("/stock/insumos");
    expect(ubicacion?.seccion?.id).toBe("insumos");
  });

  it("\"/clientes\" resuelve al sector Ventas CON la sección \"Comprobantes\" (su pantalla madre, vía rutasHijas — Clientes ya no tiene tab ni ítem de rail propio)", () => {
    const ubicacion = resolverNavegacion("/clientes");
    expect(ubicacion?.sector.id).toBe("ventas");
    expect(ubicacion?.seccion?.id).toBe("comprobantes");
  });

  it("\"/clientes/abc\" (detalle de un cliente) resuelve igual a Comprobantes", () => {
    const ubicacion = resolverNavegacion("/clientes/abc");
    expect(ubicacion?.sector.id).toBe("ventas");
    expect(ubicacion?.seccion?.id).toBe("comprobantes");
  });

  it("\"/clientes/abc/editar\" (nivel más profundo) también resuelve a Comprobantes", () => {
    const ubicacion = resolverNavegacion("/clientes/abc/editar");
    expect(ubicacion?.sector.id).toBe("ventas");
    expect(ubicacion?.seccion?.id).toBe("comprobantes");
  });

  it("\"/tareas/transferir\" resuelve al sector Tareas sin sección", () => {
    const ubicacion = resolverNavegacion("/tareas/transferir");
    expect(ubicacion?.sector.id).toBe("tareas");
    expect(ubicacion?.seccion).toBeNull();
  });

  it("\"/ventas\" (ruta eliminada, redirige a /comprobantes en next.config.ts) igual resuelve al sector Ventas sin sección puntual si se la consulta directo", () => {
    const ubicacion = resolverNavegacion("/ventas");
    expect(ubicacion?.sector.id).toBe("ventas");
    expect(ubicacion?.seccion).toBeNull();
  });

  it("\"/produccion\" (ruta eliminada, redirige a /stock) resuelve a su sector sin sección", () => {
    expect(resolverNavegacion("/produccion")).toEqual({
      sector: SECTORES.find((s) => s.id === "produccion"),
      seccion: null,
    });
  });

  it("rutas fuera de cualquier sector devuelven null", () => {
    expect(resolverNavegacion("/cambiar-password")).toBeNull();
    expect(resolverNavegacion("/login")).toBeNull();
    expect(resolverNavegacion("/mi/ventas")).toBeNull();
  });

  it("rutas anidadas de varios niveles resuelven al sector correcto (sin hubs, el tab bar debe verse activo en cualquiera de estas)", () => {
    expect(resolverNavegacion("/plata/deudas/nueva")?.sector.id).toBe("plata");
    expect(resolverNavegacion("/plata/deudas/nueva")?.seccion?.id).toBe("plata");

    const lotePago = resolverNavegacion("/stock/lotes/abc/pago");
    expect(lotePago?.sector.id).toBe("produccion");
    expect(lotePago?.seccion?.id).toBe("lotes");

    const cargaRevendedor = resolverNavegacion("/revendedores/abc/carga");
    expect(cargaRevendedor?.sector.id).toBe("ventas");
    expect(cargaRevendedor?.seccion?.id).toBe("revendedores");
  });

  it("\"/\" e \"/tareas\" resuelven cada uno a su propio sector (Inicio/Tareas), no a Ventas/Producción/Plata", () => {
    const inicio = resolverNavegacion("/");
    expect(inicio?.sector.id).toBe("inicio");
    expect(inicio?.seccion).toBeNull();

    const tareas = resolverNavegacion("/tareas");
    expect(tareas?.sector.id).toBe("tareas");
    expect(tareas?.seccion).toBeNull();
  });

  it("cada sección vive en un único sector, y cada id de sección es único", () => {
    const idsVistos = new Set<string>();
    for (const sector of SECTORES) {
      for (const seccion of sector.secciones) {
        expect(idsVistos.has(seccion.id)).toBe(false);
        idsVistos.add(seccion.id);
      }
    }
  });

});

describe("destinoDeSector", () => {
  it("un sector con secciones lleva a la primera de ellas (reemplaza el hub eliminado)", () => {
    const ventas = SECTORES.find((s) => s.id === "ventas")!;
    expect(destinoDeSector(ventas)).toBe("/comprobantes");

    const produccion = SECTORES.find((s) => s.id === "produccion")!;
    expect(destinoDeSector(produccion)).toBe("/stock");

    const plata = SECTORES.find((s) => s.id === "plata")!;
    expect(destinoDeSector(plata)).toBe("/plata");
  });

  it("un sector sin secciones (Inicio, Tareas) lleva a su propia pantalla", () => {
    const inicio = SECTORES.find((s) => s.id === "inicio")!;
    expect(destinoDeSector(inicio)).toBe("/");

    const tareas = SECTORES.find((s) => s.id === "tareas")!;
    expect(destinoDeSector(tareas)).toBe("/tareas");
  });
});
