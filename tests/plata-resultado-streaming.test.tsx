import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { CuerpoResultado, EsqueletoResultado, MarcoResultado } from "@/components/plata/resultado-mes";
import { cargarResultadoMes } from "@/lib/data/ganancia";
import { desgloseResultadoDelPeriodo, filtrarGastosOperativos, mapearFilasMargenVentas } from "@/lib/dominio/margen";
import type { Database } from "@/lib/types";

/** El resultado del mes de /plata llega aparte (por streaming): su lectura
 * lenta (`v_margen_ventas`) no espera al resto y su fallo no rompe la
 * pantalla. Datos inventados. */

type Fila = Record<string, unknown>;

function fakeSupabase(tablas: Record<string, Fila[]>, conError: string[] = [], lanza = false) {
  const lecturas: Record<string, number> = {};
  const from = (tabla: string) => {
    if (lanza) throw new Error("explotó");
    lecturas[tabla] = (lecturas[tabla] ?? 0) + 1;
    const falla = conError.includes(tabla) ? { message: "boom" } : null;
    const filas = falla ? null : (tablas[tabla] ?? []);
    const b: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (res: (v: unknown) => unknown) => Promise.resolve({ data: filas, error: falla }).then(res);
          }
          return () => b;
        },
      },
    );
    return b;
  };
  return { supabase: { from } as unknown as SupabaseClient<Database>, lecturas };
}

const MARGEN: Fila[] = [
  {
    origen: "comprobante",
    fecha: "2026-10-05",
    vendedor_id: null,
    cantidad: 10,
    margen_ananja_centavos: 30_000,
    ingreso_ananja_centavos: 100_000,
    margen_vendedor_centavos: null,
    precio_unitario_venta_centavos: 10_000,
    costo_estimado: false,
  },
];
const GASTOS: Fila[] = [
  { fecha: "2026-10-07", monto_centavos: 5_000, categorias_gasto: { es_costo_produccion: false } },
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cargarResultadoMes", () => {
  it("lee cada vista una vez y da lo mismo que desgloseResultadoDelPeriodo", async () => {
    const { supabase, lecturas } = fakeSupabase({ v_margen_ventas: MARGEN, gastos: GASTOS });
    const d = await cargarResultadoMes(supabase, "2026-10");
    expect(lecturas["v_margen_ventas"]).toBe(1);
    expect(lecturas["gastos"]).toBe(1);
    const esperado = desgloseResultadoDelPeriodo(
      mapearFilasMargenVentas(MARGEN as never),
      filtrarGastosOperativos(GASTOS as never),
      "mes",
      "2026-10",
    );
    expect(d).toEqual(esperado);
    expect(d?.gastosCentavos).toBe(5_000);
  });

  it("si falla cualquiera de las dos lecturas devuelve null, no un resultado en cero", async () => {
    for (const tabla of ["v_margen_ventas", "gastos"]) {
      const { supabase } = fakeSupabase({}, [tabla]);
      expect(await cargarResultadoMes(supabase, "2026-10")).toBeNull();
    }
  });

  it("nunca rechaza, aunque el cliente explote", async () => {
    const { supabase } = fakeSupabase({}, [], true);
    await expect(cargarResultadoMes(supabase, "2026-10")).resolves.toBeNull();
  });
});

describe("tarjeta de resultado con streaming", () => {
  it("sin dato el cuerpo avisa (no muestra ceros)", () => {
    const html = renderToStaticMarkup(<CuerpoResultado desglose={null} />);
    expect(html).toContain("No se pudo calcular el resultado.");
    expect(html).not.toContain("Ganaste");
  });

  it("el marco pinta título y link aunque el cuerpo sea el esqueleto", () => {
    const html = renderToStaticMarkup(
      <MarcoResultado nombreMes="octubre">
        <EsqueletoResultado />
      </MarcoResultado>,
    );
    expect(html).toContain("Resultado de octubre");
    expect(html).toContain('href="/ganancia"');
    expect(html).toContain('data-testid="resultado-esqueleto"');
  });

  it("el esqueleto reserva las mismas cajas que las filas reales", () => {
    const d = desgloseResultadoDelPeriodo(mapearFilasMargenVentas(MARGEN as never), [], "mes", "2026-10");
    const real = renderToStaticMarkup(<CuerpoResultado desglose={d} />);
    const esq = renderToStaticMarkup(<EsqueletoResultado />);
    const claseAlto = (h: string) => (h.match(/min-h-1[12]/g) ?? []).join(",");
    expect(claseAlto(esq)).toBe(claseAlto(real));
  });
});
