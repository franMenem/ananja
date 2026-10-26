// Vista de la revendedora (rediseño fase 7): héroe de deuda, pastilla de
// pago pendiente, orden del DOM sin clases `order-*`, menú con los nombres
// nuevos y "Este mes ganaste" igual a la lista por mes de /mi/ganancia.
// Datos inventados.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MiInicioVista } from "@/components/mi/inicio-vista";
import { MiGananciaVista } from "@/components/mi/ganancia-vista";
import { calcularGananciaRevendedor, gananciaDelMes } from "@/lib/dominio/ganancia-revendedor";
import { TABS_MI } from "@/lib/navegacion-mi";

const VENTAS = [
  { fecha: "2026-10-03", cantidad: 10, precioVentaCentavos: 900000, precioCostoCentavos: 600000 },
  { fecha: "2026-10-20", cantidad: 5, precioVentaCentavos: 900000, precioCostoCentavos: 600000 },
  { fecha: "2026-09-10", cantidad: 4, precioVentaCentavos: 900000, precioCostoCentavos: 600000 },
];

const BASE = {
  nombre: "Rosa",
  debeCentavos: 0,
  pendienteCentavos: 0,
  encargadoNombre: "Teresa",
  valorEnPoderCentavos: 0,
  valorEnPoderDestino: null,
  stock: [
    { id: "p1", nombre: "Aceite 500 ml", enPoder: 7, tramos: [] },
    { id: "p2", nombre: "Aceite 250 ml", enPoder: 3, tramos: [] },
  ],
  movimientos: [],
  ventas: VENTAS,
  periodoActual: "2026-10",
};

describe("MiInicioVista", () => {
  it("deuda 0: número normal y pastilla 'Al día', sin rojo", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} />);
    expect(html).toContain("Al día");
    expect(html).not.toContain("text-accent");
    expect(html).toContain("Pagarle a Teresa");
  });

  it("deuda > 0: número en rojo y sin 'Al día'", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} debeCentavos={500000} />);
    expect(html).toContain("text-accent");
    expect(html).not.toContain("Al día");
  });

  it("pago pendiente: pastilla azul con el nombre del encargado", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} debeCentavos={500000} pendienteCentavos={200000} />);
    expect(html).toContain("esperando que Teresa lo confirme");
    expect(html).toContain("bg-info-tint");
  });

  it("sin encargado: el botón y la pastilla usan Ananja", () => {
    const html = renderToStaticMarkup(
      <MiInicioVista {...BASE} encargadoNombre={null} debeCentavos={1} pendienteCentavos={100} />,
    );
    expect(html).toContain("Pagarle a Ananja");
    expect(html).toContain("esperando que Ananja lo confirme");
  });

  it("botellas: total en el título y una fila por tamaño", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} />);
    expect(html).toContain("Tenés 10 botellas");
    expect(html).toContain("Aceite 500 ml");
    expect(html).toContain("Aceite 250 ml");
  });

  it("el orden del DOM es el de lectura, sin clases order-*", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} />);
    expect(html).not.toMatch(/(^|[\s"@:])order-\d/);
    const orden = ["Hola, Rosa", "Le debés a Ananja", "Registré una venta", "Tenés 10 botellas", "Este mes ganaste", "Tus pagos"];
    const posiciones = orden.map((t) => html.indexOf(t));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it("'Este mes ganaste' es la misma cifra que la fila del mes en /mi/ganancia", () => {
    const resumen = calcularGananciaRevendedor(VENTAS);
    const octubre = resumen.porMes.find((f) => f.periodo === "2026-10");
    expect(gananciaDelMes(resumen.porMes, "2026-10")).toBe(octubre?.gananciaCentavos);
    expect(gananciaDelMes(resumen.porMes, "2026-08")).toBe(0);
    const inicio = renderToStaticMarkup(<MiInicioVista {...BASE} />);
    const ganancia = renderToStaticMarkup(
      <MiGananciaVista ventas={VENTAS} debeCentavos={0} pendienteCentavos={0} movimientos={[]} />,
    );
    // 15 botellas × $3.000 = $45.000
    expect(inicio).toContain("45.000");
    expect(inicio).toContain("tabular-nums text-secondary");
    expect(ganancia).toContain("Ganaste en total");
  });

  it("sin ventas del mes: $0 sin verde", () => {
    const html = renderToStaticMarkup(<MiInicioVista {...BASE} ventas={[]} />);
    expect(html).toContain("Este mes ganaste");
    expect(html).not.toContain("tabular-nums text-secondary");
  });

  it("pagos con las pastillas de estado", () => {
    const html = renderToStaticMarkup(
      <MiInicioVista
        {...BASE}
        movimientos={[
          { id: "a", origen: "pago", estado: "pendiente", fecha: "2026-10-20", medioPago: "efectivo", montoCentavos: 100, motivoRechazo: null },
          { id: "b", origen: "pago", estado: "confirmado", fecha: "2026-10-10", medioPago: "efectivo", montoCentavos: 200, motivoRechazo: null },
          { id: "c", origen: "pago", estado: "rechazado", fecha: "2026-10-05", medioPago: "efectivo", montoCentavos: 300, motivoRechazo: "No llegó" },
        ] as never}
      />,
    );
    expect(html).toContain("Por confirmar");
    expect(html).toContain("Confirmado");
    expect(html).toContain("Rechazado");
  });
});

describe("menú de la revendedora", () => {
  it("tiene los nombres nuevos y entra en 4 tabs", () => {
    expect(TABS_MI.map((t) => t.label)).toEqual(["Inicio", "Mis ventas", "Ganancia", "Material"]);
    expect(TABS_MI.map((t) => t.href)).toEqual(["/mi", "/mi/ventas", "/mi/ganancia", "/mi/material"]);
  });

  it("ningún texto de la vista dice 'lote'", () => {
    for (const f of ["components/mi/inicio-vista.tsx", "components/mi/ganancia-vista.tsx", "components/mi/ventas-vista.tsx"]) {
      expect(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/>[^<{]*\blotes?\b/i);
    }
  });
});
