import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { MiInicioVista } from "@/components/mi/inicio-vista";
import { HeroeRevendedora } from "@/components/revendedores/ficha/heroe";
import { EnPoderFicha } from "@/components/revendedores/ficha/en-poder";
import { estadoDeudaHero } from "@/lib/dominio/deuda-hero";

describe("estadoDeudaHero", () => {
  it("deuda 0 sigue 'Al día' (con o sin pendiente)", () => {
    expect(estadoDeudaHero(0, 0)).toEqual({ tipo: "al-dia" });
    expect(estadoDeudaHero(0, 500)).toEqual({ tipo: "al-dia" });
  });
  it("sin pendiente: debe, en rojo", () => {
    expect(estadoDeudaHero(1000, 0)).toEqual({ tipo: "debe", rojo: true });
  });
  it("pendiente parcial: rojo y cuánto queda", () => {
    expect(estadoDeudaHero(1000, 400)).toEqual({
      tipo: "parcial",
      rojo: true,
      pendienteCentavos: 400,
      quedaCentavos: 600,
    });
  });
  it("pendiente total (o más): no es rojo", () => {
    expect(estadoDeudaHero(1000, 1000)).toEqual({ tipo: "todo-pagado", rojo: false, pendienteCentavos: 1000 });
    expect(estadoDeudaHero(1000, 1500).tipo).toBe("todo-pagado");
  });
});

const BASE = {
  nombre: "Rosa",
  debeCentavos: 100000,
  pendienteCentavos: 0,
  encargadoNombre: "Teresa",
  valorEnPoderCentavos: 0,
  valorEnPoderDestino: null,
  stock: [
    { id: "p1", nombre: "Aceite 500 ml", enPoder: 7, tramos: [] },
    { id: "p2", nombre: "Aceite 250 ml", enPoder: 0, tramos: [] },
  ],
  movimientos: [],
  ventas: [],
  periodoActual: "2026-10",
};

describe("/mi: héroe de deuda", () => {
  it("pago por confirmar que cubre todo: sin rojo, pastilla nueva y botón secundario", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} pendienteCentavos={100000} />);
    expect(html).not.toContain("text-accent");
    expect(html).toContain("Ya pagaste todo, falta que Teresa lo confirme");
    expect(html).not.toContain("Te queda pagar");
    expect(html).toContain("Pagarle a Teresa");
  });
  it("pago parcial: rojo, pastilla azul y 'Te queda pagar'", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} pendienteCentavos={40000} />);
    expect(html).toContain("text-accent");
    expect(html).toContain("esperando que Teresa lo confirme");
    expect(html).toContain("Te queda pagar");
  });
  it("no lista tamaños con 0 botellas", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} />);
    expect(html).toContain("Aceite 500 ml");
    expect(html).not.toContain("Aceite 250 ml");
  });
  it("sin botellas: solo el título, sin lista ni 'Cuando lo vendas'", () => {
    const html = renderToStaticMarkup(
      <MiInicioVista
        {...BASE}
        valorEnPoderCentavos={5000}
        stock={[{ id: "p2", nombre: "Aceite 250 ml", enPoder: 0, tramos: [] }]}
      />,
    );
    expect(html).toContain("No tenés botellas ahora");
    expect(html).not.toContain("Aceite 250 ml");
    expect(html).not.toContain("Cuando lo vendas");
  });
});

describe("ficha admin", () => {
  it("pago que cubre todo: sin rojo y con pastilla nueva", () => {
    const html = renderToStaticMarkup(
      <HeroeRevendedora
        debeCentavos={100000}
        pendienteCentavos={100000}
        rendidoCentavos={0}
        encargadoNombre="Teresa"
      />,
    );
    expect(html).not.toContain("text-accent");
    expect(html).toContain("Ya lo pagó todo, falta que Teresa lo confirme");
  });
  it("pago parcial: rojo y 'Le queda pagar'", () => {
    const html = renderToStaticMarkup(
      <HeroeRevendedora debeCentavos={100000} pendienteCentavos={30000} rendidoCentavos={0} />,
    );
    expect(html).toContain("text-accent");
    expect(html).toContain("esperando que Ananja lo confirme");
    expect(html).toContain("Le queda pagar");
  });
  it("'Lo que tiene' sin botellas dice 'No tiene botellas ahora'", () => {
    const html = renderToStaticMarkup(
      <EnPoderFicha
        vendedorId="v"
        productos={[
          {
            id: "p",
            nombre: "Aceite 250 ml",
            enPoder: 0,
            precioActualCentavos: null,
            precioMayoristaCentavos: null,
            valorEnPoderCentavos: 0,
          },
        ]}
      />,
    );
    expect(html).toContain("No tiene botellas ahora");
    expect(html).not.toContain("Aceite 250 ml");
  });
});
