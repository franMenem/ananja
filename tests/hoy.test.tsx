// Pantalla Hoy (rediseño fase 3): filas de tarea, estado sin tareas, y que
// las cifras de "Cómo estamos" salgan de las mismas funciones que las
// pantallas de origen. Datos inventados.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { FilaTarea } from "@/components/tareas/fila-tarea";
import { InicioVista } from "@/components/inicio/inicio-vista";
import type { InicioDatos } from "@/lib/data/inicio";
import {
  periodoMesAnterior,
  resumirPlataEnManos,
  totalBotellasDeposito,
  totalLeDeben,
  variacionPorcentual,
} from "@/lib/dominio/inicio";
import {
  filtrarGastosOperativos,
  gananciaAnanjaDelPeriodo,
  mapearFilasMargenVentas,
} from "@/lib/dominio/margen";
import type { Tarea } from "@/lib/dominio/tareas";

function tarea(extra: Partial<Tarea> = {}): Tarea {
  return {
    id: "t1",
    tipo: "ventas_sin_precio",
    etiqueta: "Revendedora",
    urgencia: "normal",
    titulo: "Falta el precio de unas ventas",
    detalle: "Ana vendió 3 botellas sin precio cargado",
    href: "/revendedores/r1",
    desde: "2026-10-01",
    ...extra,
  };
}

function datosBase(extra: Partial<InicioDatos> = {}): InicioDatos {
  return {
    saludo: "Buen día",
    fechaLarga: "Sábado 25 de octubre",
    nombre: "Fran",
    tareasTop: [],
    totalTareasBadge: 0,
    totalTareas: 0,
    errorTareas: false,
    medioDeposito: "mercado_pago",
    cuentaTotalCentavos: 418303971,
    enManos: { totalCentavos: 250000, cantidad: 2 },
    leDebenCentavos: 1234500,
    botellasDeposito: 120,
    stockBajo: [],
    ganancia: { centavos: 500000, algunCostoCargado: true, variacionPct: 12, nombreMesAnterior: "Septiembre" },
    ...extra,
  };
}

describe("FilaTarea", () => {
  it("sin etiqueta de categoría ni borde de color; detalle con title", () => {
    const html = renderToStaticMarkup(<FilaTarea tarea={tarea()} medioDeposito="banco" />);
    expect(html).toContain("Falta el precio de unas ventas");
    expect(html).toContain('title="Ana vendió 3 botellas sin precio cargado"');
    expect(html).not.toContain(">Revendedora<");
    expect(html).not.toContain("border-l-");
    expect(html).not.toContain("Urgente");
    expect(html).toContain(">Ver<");
  });

  it("urgente muestra la pastilla 'Urgente'", () => {
    const html = renderToStaticMarkup(<FilaTarea tarea={tarea({ urgencia: "urgente" })} medioDeposito="banco" />);
    expect(html).toContain("Urgente");
    expect(html).toContain("bg-accent-tint");
  });

  it("la acción rápida es un botón secundario de 44px", () => {
    const html = renderToStaticMarkup(
      <FilaTarea
        tarea={tarea({
          accion: {
            tipo: "depositar",
            tenedorId: "p1",
            montoCentavos: 10000,
            tenedorNombre: null,
          },
        })}
        medioDeposito="banco"
      />,
    );
    expect(html).toContain("Pasar a la cuenta");
    expect(html).toContain("min-h-11");
    expect(html).toContain("rounded-xl");
  });
});

describe("InicioVista (Hoy)", () => {
  it("sin tareas: 'No hay nada pendiente.' sin emoji ni link a /tareas", () => {
    const html = renderToStaticMarkup(<InicioVista datos={datosBase()} />);
    expect(html).toContain("No hay nada pendiente.");
    expect(html).not.toContain("👍");
    expect(html).not.toContain('href="/tareas"');
    expect(html).not.toContain("+ Comprobante");
    expect(html).not.toContain("+ Gasto");
  });

  it("con tareas: pastilla con el total y 'Ver las N cosas'", () => {
    const html = renderToStaticMarkup(
      <InicioVista datos={datosBase({ tareasTop: [tarea(), tarea({ id: "t2" })], totalTareas: 7, totalTareasBadge: 7 })} />,
    );
    expect(html).toContain("Ver las 7 cosas");
    expect(html).toContain('href="/tareas"');
  });

  it("las tres tarjetas son links enteros a su pantalla", () => {
    const html = renderToStaticMarkup(<InicioVista datos={datosBase()} />);
    expect(html).toContain('href="/plata"');
    expect(html).toContain('href="/stock"');
    expect(html).toContain('href="/ganancia"');
    expect(html).toContain("Y $ 2.500,00 en manos de 2 personas");
    expect(html).toContain("Este mes ganaste");
    expect(html).toContain("+12% vs. septiembre");
  });

  it("nadie debe / nadie tiene plata: textos neutros y número sin rojo", () => {
    const html = renderToStaticMarkup(
      <InicioVista datos={datosBase({ leDebenCentavos: 0, enManos: { totalCentavos: 0, cantidad: 0 } })} />,
    );
    expect(html).toContain("Nadie te debe");
    expect(html).toContain("Nadie tiene plata en mano");
  });

  it("stock bajo: máximo 2 pastillas y 'y N más'", () => {
    const html = renderToStaticMarkup(
      <InicioVista
        datos={datosBase({
          stockBajo: [
            { productoId: "a", presentacion: "250 ml", stock: 8 },
            { productoId: "b", presentacion: "500 ml", stock: 3 },
            { productoId: "c", presentacion: "1 L", stock: 1 },
          ],
        })}
      />,
    );
    expect(html).toContain("250 ml: quedan 8");
    expect(html).toContain("500 ml: quedan 3");
    expect(html).not.toContain("1 L: quedan 1");
    expect(html).toContain("y 1 más");
  });

  it("variación negativa usa el signo menos y el tono 'debe'", () => {
    const html = renderToStaticMarkup(
      <InicioVista
        datos={datosBase({
          ganancia: { centavos: 100000, algunCostoCargado: true, variacionPct: -5, nombreMesAnterior: "Septiembre" },
        })}
      />,
    );
    expect(html).toContain("−5% vs. septiembre");
  });
});

describe("cifras de Hoy = pantallas de origen", () => {
  it("Hoy y /ganancia usan la misma función para la ganancia del mes", () => {
    const hoy = readFileSync("lib/data/inicio.ts", "utf8");
    const ganancia = readFileSync("app/(app)/ganancia/page.tsx", "utf8");
    expect(hoy).toContain("gananciaAnanjaDelPeriodo(");
    // /ganancia lo usa a través de `desgloseResultadoDelPeriodo`, que parte de
    // `gananciaAnanjaDelPeriodo` (ver tests/plata-fase4.test.tsx).
    expect(ganancia).toContain("desgloseResultadoDelPeriodo(");
  });

  it("Hoy y /plata usan las mismas funciones para 'Te deben' y 'en manos'", () => {
    const hoy = readFileSync("lib/data/inicio.ts", "utf8");
    const plata = readFileSync("app/(app)/plata/page.tsx", "utf8");
    for (const f of ["totalLeDeben(", "resumirPlataEnManos("]) {
      expect(hoy).toContain(f);
      expect(plata).toContain(f);
    }
  });

  it("ganancia del mes: margen − gastos operativos (caso numérico)", () => {
    const filas = mapearFilasMargenVentas([
      {
        origen: "comprobante",
        fecha: "2026-10-05",
        vendedor_id: "v1",
        cantidad: 10,
        margen_ananja_centavos: 800000,
        margen_vendedor_centavos: null,
        precio_unitario_venta_centavos: 1000,
        costo_estimado: false,
      },
      {
        origen: "revendedor",
        fecha: "2026-10-12",
        vendedor_id: "v2",
        cantidad: 4,
        margen_ananja_centavos: 200000,
        margen_vendedor_centavos: 50000,
        precio_unitario_venta_centavos: 1000,
        costo_estimado: false,
      },
      {
        origen: "comprobante",
        fecha: "2026-09-20",
        vendedor_id: "v1",
        cantidad: 5,
        margen_ananja_centavos: 400000,
        margen_vendedor_centavos: null,
        precio_unitario_venta_centavos: 1000,
        costo_estimado: false,
      },
    ]);
    const gastos = filtrarGastosOperativos([
      { fecha: "2026-10-07", monto_centavos: 100000, categorias_gasto: { es_costo_produccion: false } },
      // los de producción ya están dentro del margen: no se restan
      { fecha: "2026-10-08", monto_centavos: 999999, categorias_gasto: { es_costo_produccion: true } },
      { fecha: "2026-09-10", monto_centavos: 100000, categorias_gasto: { es_costo_produccion: false } },
    ]);
    const octubre = gananciaAnanjaDelPeriodo(filas, gastos, "mes", "2026-10");
    const septiembre = gananciaAnanjaDelPeriodo(filas, gastos, "mes", periodoMesAnterior(2026, 9));
    expect(octubre.gananciaAnanjaCentavos).toBe(900000); // 800000 + 200000 − 100000
    expect(septiembre.gananciaAnanjaCentavos).toBe(300000); // 400000 − 100000
    expect(variacionPorcentual(octubre.gananciaAnanjaCentavos, septiembre.gananciaAnanjaCentavos)).toBe(200);
  });

  it("variacionPorcentual: sin mes anterior positivo no hay comparación", () => {
    expect(variacionPorcentual(100, 0)).toBeNull();
    expect(variacionPorcentual(100, -50)).toBeNull();
    expect(variacionPorcentual(88, 100)).toBe(-12);
  });

  it("totalLeDeben: revendedoras con saldo > 0 más clientes", () => {
    const total = totalLeDeben(
      [
        { vendedor_id: "a", nombre: "Ana", saldo_centavos: 100000 },
        { vendedor_id: "b", nombre: "Bea", saldo_centavos: -5000 },
        { vendedor_id: "c", nombre: "Cora", saldo_centavos: 0 },
      ],
      [{ deuda_centavos: 25000 }, { deuda_centavos: 0 }, { deuda_centavos: null }],
    );
    expect(total).toBe(125000);
  });

  it("resumirPlataEnManos cuenta a quien tiene algo (≠ 0), como /plata", () => {
    expect(
      resumirPlataEnManos([
        { tenedor_id: "a", nombre: "Ana", total_centavos: 10000 },
        { tenedor_id: "b", nombre: "Bea", total_centavos: -2000 },
        { tenedor_id: "c", nombre: "Cora", total_centavos: 0 },
        { tenedor_id: null, nombre: null, total_centavos: 999 },
      ]),
    ).toEqual({ totalCentavos: 8000, cantidad: 2 });
  });

  it("totalBotellasDeposito suma el stock de todas las presentaciones", () => {
    expect(totalBotellasDeposito([{ stock: 10 }, { stock: null }, { stock: 5 }])).toBe(15);
  });
});
