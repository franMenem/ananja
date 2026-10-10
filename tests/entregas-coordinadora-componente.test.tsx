import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EntregasCoordinadora } from "@/components/revendedores/ficha/entregas-coordinadora";
import {
  ENTREGAS_COORDINADORA_VISIBLES,
  armarEntregasCoordinadora,
  type EntregaCruda,
} from "@/lib/dominio/entregas-coordinador";

function entregasDe(n: number) {
  const entregas: EntregaCruda[] = Array.from({ length: n }, (_, i) => ({
    id: `e${String(i).padStart(3, "0")}`,
    vendedor_id: "rev-1",
    admin_id: i === 0 ? "admin-1" : "coord-a",
    tipo: "entrega",
    // e000 es la más nueva.
    fecha: `2026-09-${String(30 - i).padStart(2, "0")}`,
    created_at: "2026-09-30T10:00:00Z",
  }));
  return armarEntregasCoordinadora({
    coordinadorId: "coord-a",
    entregas,
    items: entregas.map((e, i) => ({
      entrega_id: e.id,
      producto_id: "p1",
      cantidad: 2,
      lote_id: i % 2 === 0 ? "lote-1" : null,
    })),
    nombrePorVendedor: new Map([
      ["rev-1", "Revendedora 1"],
      ["admin-1", "Admin 1"],
    ]),
    nombrePorProducto: new Map([["p1", "Botella 500 ml"]]),
    fechaPorLote: new Map([["lote-1", "2026-08-15"]]),
  });
}

describe("EntregasCoordinadora", () => {
  it("sin entregas dice que todavía no hay", () => {
    const html = renderToStaticMarkup(<EntregasCoordinadora entregas={entregasDe(0)} />);
    expect(html).toContain("Todavía no hay entregas a sus revendedoras.");
    expect(html).not.toContain("<details");
  });

  it("si la lectura falló avisa, no dice que no hay entregas", () => {
    const html = renderToStaticMarkup(<EntregasCoordinadora entregas={null} />);
    expect(html).toContain("No se pudieron cargar las entregas.");
    expect(html).not.toContain("Todavía no hay");
  });

  it("muestra total, link a la revendedora, lote con link y quién la cargó", () => {
    const html = renderToStaticMarkup(<EntregasCoordinadora entregas={entregasDe(3)} />);
    expect(html).toContain("Entregadas en total:");
    expect(html).toContain("6 botellas");
    expect(html).toContain('href="/revendedores/rev-1"');
    expect(html).toContain('href="/stock/lotes/lote-1"');
    expect(html).toContain("Lote del 15/8");
    expect(html).toContain("sin lote");
    expect(html).toContain("la cargó Admin 1");
    expect(html.match(/la cargó/g)).toHaveLength(1);
    expect(html).not.toContain("<details");
  });

  it(`con más de ${ENTREGAS_COORDINADORA_VISIBLES} entregas pliega las anteriores`, () => {
    const html = renderToStaticMarkup(<EntregasCoordinadora entregas={entregasDe(ENTREGAS_COORDINADORA_VISIBLES + 5)} />);
    expect(html).toContain("Ver las anteriores (5)");
    const [antes, plegado] = html.split("<details");
    expect(antes.match(/A <a /g)).toHaveLength(ENTREGAS_COORDINADORA_VISIBLES);
    expect(plegado.match(/A <a /g)).toHaveLength(5);
  });

  it("una devolución dice 'Devolvió' y resta del total", () => {
    const datos = armarEntregasCoordinadora({
      coordinadorId: "coord-a",
      entregas: [
        { id: "e1", vendedor_id: "rev-1", admin_id: "coord-a", tipo: "entrega", fecha: "2026-09-01", created_at: "2026-09-01T10:00:00Z" },
        { id: "d1", vendedor_id: "rev-1", admin_id: "coord-a", tipo: "devolucion", fecha: "2026-09-02", created_at: "2026-09-02T10:00:00Z" },
      ],
      items: [
        { entrega_id: "e1", producto_id: "p1", cantidad: 5, lote_id: null },
        { entrega_id: "d1", producto_id: "p1", cantidad: 1, lote_id: null },
      ],
      nombrePorVendedor: new Map([["rev-1", "Revendedora 1"]]),
      nombrePorProducto: new Map([["p1", "Botella 500 ml"]]),
      fechaPorLote: new Map(),
    });
    const html = renderToStaticMarkup(<EntregasCoordinadora entregas={datos} />);
    expect(html).toContain("Devolvió");
    expect(html).toContain("4 botellas");
  });
});
