import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

import { PageHeaderProvider } from "@/components/page-header-context";
import { EntregaForm } from "@/components/revendedores/entrega-form";
import {
  devolverTodo,
  devolverTodoDeProducto,
  itemsDeDevolucion,
  pedidosEnPoderPorProducto,
  primerExceso,
} from "@/lib/dominio/devolucion";
import type { EnManosFila } from "@/lib/dominio/lote-en-manos";
import type { Tables } from "@/lib/types";

const fechas = new Map([
  ["lote-15", "2026-10-15"],
  ["lote-17", "2026-10-17"],
  ["lote-20", "2026-10-20"],
]);

const filas: EnManosFila[] = [
  { vendedorId: "ana", loteId: "lote-17", productoId: "p500", enPoder: 10 },
  { vendedorId: "ana", loteId: "lote-15", productoId: "p500", enPoder: 40 },
  { vendedorId: "ana", loteId: "lote-20", productoId: "p500", enPoder: 0 },
  { vendedorId: "ana", loteId: "lote-17", productoId: "p250", enPoder: 7 },
  { vendedorId: "ana", loteId: null, productoId: "p250", enPoder: 3 },
  { vendedorId: "otra", loteId: "lote-20", productoId: "p500", enPoder: 99 },
];

describe("pedidosEnPoderPorProducto", () => {
  const pedidos = pedidosEnPoderPorProducto(filas, "ana", fechas);

  it("solo los pedidos con botellas en poder de ella, del más viejo al más nuevo", () => {
    expect(pedidos.p500).toEqual([
      { loteId: "lote-15", fecha: "2026-10-15", enPoder: 40 },
      { loteId: "lote-17", fecha: "2026-10-17", enPoder: 10 },
    ]);
    expect(pedidos.p250).toEqual([
      { loteId: "lote-17", fecha: "2026-10-17", enPoder: 7 },
    ]);
  });

  it("no ofrece pedidos en cero ni de otras revendedoras", () => {
    expect(pedidos.p500.some((p) => p.loteId === "lote-20")).toBe(false);
  });

  it("devolver todo llena cada producto/pedido con lo que tiene", () => {
    expect(devolverTodo(pedidos)).toEqual({
      "p500:lote-15": 40,
      "p500:lote-17": 10,
      "p250:lote-17": 7,
    });
    expect(
      devolverTodoDeProducto({ "p250:lote-17": 2 }, "p500", pedidos.p500),
    ).toEqual({
      "p250:lote-17": 2,
      "p500:lote-15": 40,
      "p500:lote-17": 10,
    });
  });

  it("los ítems siempre llevan lote_id y se omiten las cantidades en cero", () => {
    expect(
      itemsDeDevolucion({ "p500:lote-15": 5, "p500:lote-17": 0 }, pedidos),
    ).toEqual([{ producto_id: "p500", cantidad: 5, lote_id: "lote-15" }]);
  });

  it("detecta una cantidad mayor a lo que tiene en poder de ese pedido", () => {
    expect(primerExceso({ "p500:lote-17": 11 }, pedidos)?.pedido.enPoder).toBe(
      10,
    );
    expect(primerExceso(devolverTodo(pedidos), pedidos)).toBeNull();
  });
});

describe("EntregaForm en modo devolución", () => {
  const productos = [
    { id: "p500", nombre: "Botella 500 ml" },
    { id: "p250", nombre: "Botella 250 ml" },
    { id: "p100", nombre: "Botella 100 ml" },
  ] as Tables<"productos">[];

  const html = renderToStaticMarkup(
    <PageHeaderProvider>
      <EntregaForm
        vendedorId="ana"
        vendedorNombre="Ana"
        productos={productos}
        tipoInicial="devolucion"
        soloDevolucion
        lotesConStock={[]}
        pedidosEnPoder={pedidosEnPoderPorProducto(filas, "ana", fechas)}
      />
    </PageHeaderProvider>,
  );

  it("muestra solo los pedidos con stock, con cuánto tiene de cada uno", () => {
    expect(html).toContain("tiene 40");
    expect(html).toContain("tiene 10");
    expect(html).toContain("tiene 7");
    expect(html).not.toContain("99");
  });

  it("no ofrece productos sin botellas en poder y tiene el botón Devolver todo", () => {
    expect(html).not.toContain("Botella 100 ml");
    expect(html).toContain("Devolver todo");
  });
});
