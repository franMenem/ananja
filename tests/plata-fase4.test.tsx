// Rediseño fase 4 (Plata): el desglose del resultado, "Fuera de la cuenta"
// sin personas ni deudas, y que ningún cero salga en rojo. Datos inventados.
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

import { FilasResultado } from "@/components/plata/resultado-mes";
import { FueraDeLaCuenta } from "@/components/plata/fuera-de-la-cuenta";
import { totalAnanjaDebe, totalLeDeben } from "@/lib/dominio/inicio";
import {
  desgloseResultadoDelPeriodo,
  filtrarGastosOperativos,
  gananciaAnanjaDelPeriodo,
  mapearFilasMargenVentas,
  type DesgloseResultado,
} from "@/lib/dominio/margen";

const VACIA = { pedidosPorPagar: [], deudasNegocio: [] };

function fila(extra: Record<string, unknown>) {
  return {
    origen: "comprobante",
    fecha: "2026-10-05",
    vendedor_id: "v1",
    cantidad: 10,
    margen_ananja_centavos: 800000,
    ingreso_ananja_centavos: 2000000,
    margen_vendedor_centavos: null,
    precio_unitario_venta_centavos: 3000,
    costo_estimado: false,
    ...extra,
  };
}

const FILAS = mapearFilasMargenVentas([
  fila({}),
  // revendedora: cobró 1.000.000 y la producción costó 600.000
  fila({ origen: "revendedor", fecha: "2026-10-12", vendedor_id: "v2", cantidad: 4, margen_ananja_centavos: 400000, ingreso_ananja_centavos: 1000000 }),
  // sin costo cargado: no entra a ninguna cuenta
  fila({ fecha: "2026-10-20", margen_ananja_centavos: null, ingreso_ananja_centavos: 500000 }),
  // otro mes
  fila({ fecha: "2026-09-20", margen_ananja_centavos: 999, ingreso_ananja_centavos: 5000 }),
]);
const GASTOS = filtrarGastosOperativos([
  { fecha: "2026-10-07", monto_centavos: 100000, categorias_gasto: { es_costo_produccion: false } },
  { fecha: "2026-10-08", monto_centavos: 999999, categorias_gasto: { es_costo_produccion: true } },
  { fecha: "2026-09-10", monto_centavos: 77, categorias_gasto: { es_costo_produccion: false } },
]);

describe("desgloseResultadoDelPeriodo", () => {
  it("cobro − costo − gastos = ganaste, exacto, y ganaste = la ganancia compartida", () => {
    const d = desgloseResultadoDelPeriodo(FILAS, GASTOS, "mes", "2026-10");
    expect(d.cobroBotellasCentavos).toBe(3000000);
    expect(d.costoBotellasCentavos).toBe(1800000); // producción de las dos ventas con costo
    expect(d.gastosCentavos).toBe(100000); // los de producción ya están en el costo
    expect(d.cobroBotellasCentavos - d.costoBotellasCentavos - d.gastosCentavos).toBe(d.gananciaCentavos);
    const compartida = gananciaAnanjaDelPeriodo(FILAS, GASTOS, "mes", "2026-10");
    expect(d.gananciaCentavos).toBe(compartida.gananciaAnanjaCentavos);
    expect(d.gananciaCentavos).toBe(1100000); // 800000 + 400000 − 100000
  });

  it("las botellas sin costo no se cuentan y se avisan", () => {
    const d = desgloseResultadoDelPeriodo(FILAS, GASTOS, "mes", "2026-10");
    expect(d.unidadesSinCosto).toBe(10);
    expect(d.algunCostoCargado).toBe(true);
  });

  it("también cierra por año y en un período vacío da todo cero", () => {
    const anio = desgloseResultadoDelPeriodo(FILAS, GASTOS, "anio", "2026");
    expect(anio.cobroBotellasCentavos - anio.costoBotellasCentavos - anio.gastosCentavos).toBe(
      gananciaAnanjaDelPeriodo(FILAS, GASTOS, "anio", "2026").gananciaAnanjaCentavos,
    );
    const vacio = desgloseResultadoDelPeriodo(FILAS, GASTOS, "mes", "2025-01");
    expect(vacio.cobroBotellasCentavos).toBe(0);
    expect(vacio.costoBotellasCentavos).toBe(0);
    expect(vacio.gananciaCentavos).toBe(0);
    expect(vacio.algunCostoCargado).toBe(false);
  });

  it("si una fila trae margen pero no ingreso, cierra igual (costo 0 en esa fila)", () => {
    const filas = mapearFilasMargenVentas([fila({ ingreso_ananja_centavos: undefined })]);
    const d = desgloseResultadoDelPeriodo(filas, [], "mes", "2026-10");
    expect(d.cobroBotellasCentavos - d.costoBotellasCentavos - d.gastosCentavos).toBe(d.gananciaCentavos);
    expect(d.costoBotellasCentavos).toBe(0);
  });

  it("/plata, /ganancia y Hoy salen de la misma ganancia", () => {
    expect(readFileSync("app/(app)/plata/page.tsx", "utf8")).toContain("desgloseResultadoDelPeriodo(");
    expect(readFileSync("app/(app)/ganancia/page.tsx", "utf8")).toContain("desgloseResultadoDelPeriodo(");
    expect(readFileSync("lib/dominio/margen.ts", "utf8")).toMatch(
      /export function desgloseResultadoDelPeriodo[\s\S]*?const base = gananciaAnanjaDelPeriodo\(/,
    );
    expect(readFileSync("lib/data/inicio.ts", "utf8")).toContain("gananciaAnanjaDelPeriodo(");
  });
});

function desglose(extra: Partial<DesgloseResultado> = {}): DesgloseResultado {
  return {
    periodo: "2026-10",
    cobroBotellasCentavos: 3000000,
    costoBotellasCentavos: 1800000,
    gastosCentavos: 100000,
    gananciaCentavos: 1100000,
    algunCostoCargado: true,
    unidadesSinCosto: 0,
    algunCostoEstimado: false,
    ...extra,
  };
}

describe("FilasResultado", () => {
  it("muestra las tres filas y 'Ganaste' en verde si es positivo", () => {
    const html = renderToStaticMarkup(<FilasResultado desglose={desglose()} />);
    expect(html).toContain("Lo que cobró Ananja por las botellas");
    expect(html).toContain("Lo que costaron las botellas");
    expect(html).toContain("Gastos");
    expect(html).toContain("Ganaste");
    expect(html).toContain("text-secondary");
    expect(html).not.toContain("text-accent");
  });

  it("Ganaste en 0 no va en rojo; negativo sí", () => {
    const cero = renderToStaticMarkup(<FilasResultado desglose={desglose({ gananciaCentavos: 0 })} />);
    expect(cero).not.toContain("text-accent");
    const neg = renderToStaticMarkup(<FilasResultado desglose={desglose({ gananciaCentavos: -500 })} />);
    expect(neg).toContain("text-accent");
  });

  it("sin total (para /ganancia) no repite 'Ganaste'", () => {
    const html = renderToStaticMarkup(<FilasResultado desglose={desglose()} mostrarTotal={false} />);
    expect(html).not.toContain("Ganaste");
  });

  it("sin costos cargados no inventa cifras", () => {
    const html = renderToStaticMarkup(
      <FilasResultado desglose={desglose({ algunCostoCargado: false, cobroBotellasCentavos: 0, costoBotellasCentavos: 0 })} />,
    );
    expect(html).toContain("Sin costos cargados");
  });
});

describe("FueraDeLaCuenta", () => {
  function render(extra: Partial<React.ComponentProps<typeof FueraDeLaCuenta>> = {}) {
    return renderToStaticMarkup(
      <FueraDeLaCuenta
        personas={[]}
        diasPorPersona={new Map()}
        totalEnManos={0}
        efectivoSinDueno={0}
        deudores={[]}
        clientes={{ cantidad: 0, totalCentavos: 0 }}
        totalLeDeben={0}
        deudaAnanja={VACIA}
        {...extra}
      />,
    );
  }

  it("con 0 personas en mano y sin deudas: tres grupos, mensajes vacíos y ningún rojo", () => {
    const html = render();
    expect(html).toContain("En manos de personas");
    expect(html).toContain("Te deben");
    expect(html).toContain("Ananja debe");
    expect(html).toContain("Nadie tiene plata en mano.");
    expect(html).toContain("Nadie le debe plata a Ananja en este momento.");
    expect(html).toContain("No hay nada pendiente de pago.");
    expect(html).not.toContain("text-accent");
  });

  it("'Te deben' en rojo solo si es mayor que cero; la persona tiene su acción", () => {
    const html = render({
      personas: [{ tenedor_id: "p1", nombre: "Laura", total_centavos: 250000 }],
      diasPorPersona: new Map([["p1", 3]]),
      totalEnManos: 250000,
      deudores: [{ vendedor_id: "r1", nombre: "Ana", saldo_centavos: 100000 }],
      totalLeDeben: 100000,
    });
    expect(html).toContain("Efectivo hace 3 días");
    expect(html).toContain("/plata/en-manos/p1");
    expect(html).toContain("/plata/depositar?tenedor=p1&amp;monto=250000");
    expect(html).toContain("Pasar a la cuenta");
    expect(html).toContain("/revendedores/r1");
    expect(html).toContain("text-accent");
  });

  it("deudas en cero (restante 0) tampoco van en rojo", () => {
    const html = render({
      deudaAnanja: {
        pedidosPorPagar: [],
        deudasNegocio: [{ id: "d1", descripcion: "Imprenta", moneda: "ARS", restanteCentavos: 0 }],
      },
    });
    expect(html).toContain("Imprenta");
    expect(html).not.toContain("text-accent");
  });
});

describe("totales de 'Ananja debe' y 'Te deben'", () => {
  it("suma pedidos y deudas en pesos; las de dólares van aparte", () => {
    expect(
      totalAnanjaDebe(
        [{ saldoCentavos: 100000 }, { saldoCentavos: 50000 }],
        [
          { moneda: "ARS", restanteCentavos: 25000 },
          { moneda: "USD", restanteCentavos: 10000 },
        ],
      ),
    ).toEqual({ pesosCentavos: 175000, usdCentavos: 10000 });
    expect(totalAnanjaDebe([], [])).toEqual({ pesosCentavos: 0, usdCentavos: 0 });
  });

  it("/plata y Hoy usan la misma función para 'Te deben'", () => {
    expect(
      totalLeDeben([{ vendedor_id: "a", nombre: "Ana", saldo_centavos: 0 }], [{ deuda_centavos: 0 }]),
    ).toBe(0);
    expect(readFileSync("app/(app)/plata/page.tsx", "utf8")).toContain("totalLeDeben(");
  });
});
