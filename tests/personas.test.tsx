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

import { HeroeRevendedora } from "@/components/revendedores/ficha/heroe";
import { AccionesFicha, hrefsAcciones } from "@/components/revendedores/ficha/acciones";
import type { MovimientoEntrega } from "@/lib/dominio/movimientos-revendedor";
import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";
import {
  armarLineaDeTiempo,
  botellasVendidasEnMes,
  estadoPersona,
  iniciales,
  ordenarPorDeuda,
  resumenEquipo,
  sinAcentos,
} from "@/lib/dominio/personas";

describe("ordenarPorDeuda", () => {
  it("pone primero al que más debe y desempata por nombre", () => {
    const filas = [
      { nombre: "Zoe", debeCentavos: 0 },
      { nombre: "Ana", debeCentavos: 0 },
      { nombre: "Beto", debeCentavos: 5000 },
      { nombre: "Cora", debeCentavos: 90000 },
      { nombre: "Dani", debeCentavos: -300 },
    ];
    expect(ordenarPorDeuda(filas).map((f) => f.nombre)).toEqual(["Cora", "Beto", "Ana", "Dani", "Zoe"]);
  });
});

describe("estadoPersona", () => {
  it("debe gana sobre por confirmar, que va en el detalle", () => {
    const e = estadoPersona(150000, 40000);
    expect(e.variante).toBe("debe");
    expect(e.detalleExtra).toContain("por confirmar");
  });
  it("sin deuda y con pago pendiente: por confirmar", () => {
    expect(estadoPersona(0, 40000)).toMatchObject({ variante: "confirmar" });
  });
  it("sin deuda ni pendientes, o con saldo a favor: al día", () => {
    expect(estadoPersona(0, 0)).toEqual({ variante: "ok", texto: "Al día", detalleExtra: null });
    expect(estadoPersona(-500, 0).variante).toBe("ok");
  });
});

describe("helpers", () => {
  it("resumenEquipo suma solo deudas positivas", () => {
    expect(
      resumenEquipo([
        { debeCentavos: 100, enPoder: 2 },
        { debeCentavos: -50, enPoder: 3 },
      ]),
    ).toEqual({ debeCentavos: 100, botellas: 5 });
  });
  it("sinAcentos e iniciales", () => {
    expect(sinAcentos("Martín Domínguez")).toBe("martin dominguez");
    expect(iniciales("laura pérez gómez")).toBe("LP");
    expect(iniciales("Teresa")).toBe("T");
  });
  it("botellasVendidasEnMes cuenta solo el mes de hoy", () => {
    const ventas = [
      { fecha: "2026-10-03", cantidad: 4 },
      { fecha: "2026-10-20", cantidad: 6 },
      { fecha: "2026-09-30", cantidad: 9 },
    ];
    expect(botellasVendidasEnMes(ventas, "2026-10-26")).toBe(10);
  });
  it("armarLineaDeTiempo intercala por fecha, movimiento primero a igual fecha", () => {
    const mov = (fecha: string): MovimientoEntrega => ({
      tipo: "entrega",
      automatica: false,
      id: fecha,
      fecha,
      createdAt: fecha,
      items: [],
    });
    const pago = (fecha: string): MovimientoPago => ({
      id: "p" + fecha,
      origen: "pago",
      montoCentavos: 1,
      medioPago: "efectivo",
      fecha,
      estado: "confirmado",
      motivoRechazo: null,
    });
    const linea = armarLineaDeTiempo([mov("2026-10-20"), mov("2026-10-01")], [pago("2026-10-20"), pago("2026-10-10")]);
    expect(linea.map((i) => (i.clase === "movimiento" ? "m" + i.movimiento.fecha : "p" + i.pago.fecha))).toEqual([
      "m2026-10-20",
      "p2026-10-20",
      "p2026-10-10",
      "m2026-10-01",
    ]);
  });
});

describe("ficha de revendedora", () => {
  it("con deuda: número en rojo y sin 'Al día'", () => {
    const html = renderToStaticMarkup(<HeroeRevendedora debeCentavos={150000} pendienteCentavos={0} rendidoCentavos={0} />);
    expect(html).toContain("text-accent");
    expect(html).not.toContain("Al día");
  });
  it("deuda 0: no es roja y dice 'Al día'", () => {
    const html = renderToStaticMarkup(<HeroeRevendedora debeCentavos={0} pendienteCentavos={0} rendidoCentavos={0} />);
    expect(html).not.toContain("text-accent");
    expect(html).toContain("Al día");
  });
  it("muestra lo que está por confirmar", () => {
    const html = renderToStaticMarkup(<HeroeRevendedora debeCentavos={0} pendienteCentavos={40000} rendidoCentavos={0} />);
    expect(html).toContain("por confirmar");
  });
  it("los botones llevan a la sección correcta", () => {
    expect(hrefsAcciones("abc")).toEqual({
      entregar: "/revendedores/abc/carga?seccion=entrega",
      pago: "/revendedores/abc/carga?seccion=pago",
      venta: "/revendedores/abc/carga?seccion=ventas",
      devolucion: "/revendedores/abc/devolucion",
    });
    const html = renderToStaticMarkup(<AccionesFicha vendedorId="abc" />);
    for (const h of Object.values(hrefsAcciones("abc"))) expect(html).toContain(`href="${h}"`);
  });
});
