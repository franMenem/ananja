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

import { AccionesFicha, hrefsAcciones } from "@/components/revendedores/ficha/acciones";
import { LoteLink } from "@/components/revendedores/ficha/lote-link";
import { HeroeBotellas } from "@/components/stock/deposito/heroe-botellas";
import { ParaProducir } from "@/components/stock/deposito/para-producir";
import { detallePresentacion, PresentacionDeposito } from "@/components/stock/deposito/presentacion-deposito";
import { FilaInsumo, textoAlcance, textoCantidadInsumo } from "@/components/stock/insumos/fila-insumo";
import { BotellasPedido } from "@/components/stock/pedido/botellas-pedido";
import { PastillaEstadoPedido } from "@/components/stock/pedido/estado-pedido";
import {
  detallePedido,
  FilaPedido,
  textoQuedanSinVender,
  tituloPedido,
} from "@/components/stock/pedido/fila-pedido";
import { HeroePedido } from "@/components/stock/pedido/heroe-pedido";
import { PagoPedido } from "@/components/stock/pedido/pago-pedido";
import {
  alcancePorPresentacion,
  porcentajeDeposito,
  repartoPorTamano,
  totalBotellas,
} from "@/lib/dominio/botellas";
import { mensajeErrorLote } from "@/lib/dominio/lotes";
import { estadoPedido, variacionContraAnterior } from "@/lib/dominio/pedidos-lote";
import { rotuloLoteVenta } from "@/lib/dominio/venta-coordinador";

/** Solo el texto que ve la persona: sin etiquetas ni atributos (los href llevan /stock/lotes/…). */
function textoVisible(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}
const LOTE = /\blotes?\b/i;

describe("total de botellas", () => {
  it("es depósito + en manos de revendedoras", () => {
    const t = totalBotellas(
      [{ stock: 120 }, { stock: 30 }, { stock: null }],
      [{ en_poder: 40 }, { en_poder: 10 }, { en_poder: null }],
    );
    expect(t).toEqual({ deposito: 150, revendedoras: 50, total: 200 });
  });
  it("sin nada es 0 y la barra no se parte por cero", () => {
    const t = totalBotellas([], []);
    expect(t.total).toBe(0);
    expect(porcentajeDeposito(t)).toBe(0);
  });
  it("la barra mide la parte del depósito", () => {
    expect(porcentajeDeposito({ deposito: 150, total: 200 })).toBe(75);
    expect(porcentajeDeposito({ deposito: 5, total: 5 })).toBe(100);
  });
  it("el héroe muestra el total y la leyenda", () => {
    const html = renderToStaticMarkup(<HeroeBotellas deposito={150} revendedoras={50} />);
    const texto = textoVisible(html);
    expect(texto).toContain("200");
    expect(texto).toContain("en total");
    expect(texto).toContain("150 en el depósito · 50 en revendedoras");
    expect(html).toContain("width:75%");
  });
  it("si no se pudo leer lo de las revendedoras, muestra solo el depósito", () => {
    const html = renderToStaticMarkup(<HeroeBotellas deposito={150} revendedoras={null} />);
    expect(textoVisible(html)).toContain("150");
    expect(html).not.toContain("width:");
  });
});

describe("reparto por tamaño", () => {
  const deposito = [
    { producto_id: "a", nombre: "Botella 250 ml", presentacion_ml: 250, stock: 3, umbral_minimo: 10, bajo_umbral: true },
    { producto_id: "b", nombre: "Botella 500 ml", presentacion_ml: 500, stock: 80, umbral_minimo: 20, bajo_umbral: false },
  ];
  const enManos = [
    { producto_id: "a", en_poder: 4 },
    { producto_id: "a", en_poder: 6 },
    { producto_id: "b", en_poder: 25 },
  ];
  it("suma lo de las revendedoras por presentación", () => {
    const p = repartoPorTamano(deposito, enManos);
    expect(p.map((x) => [x.productoId, x.deposito, x.revendedoras, x.quedanPocas])).toEqual([
      ["a", 3, 10, true],
      ["b", 80, 25, false],
    ]);
  });
  it("el detalle dice dónde están y, si quedan pocas, el mínimo", () => {
    const [a, b] = repartoPorTamano(deposito, enManos);
    expect(detallePresentacion(a)).toBe("3 en depósito · 10 en revendedoras · mínimo 10");
    expect(detallePresentacion(b)).toBe("80 en depósito · 25 en revendedoras");
  });
  it("la fila de una presentación con pocas lleva la pastilla de aviso", () => {
    const [a, b] = repartoPorTamano(deposito, enManos);
    const poca = renderToStaticMarkup(<PresentacionDeposito presentacion={a} segmentos={[]} />);
    expect(poca).toContain("Quedan pocas");
    expect(poca).toContain("bg-warning-tint");
    const bien = renderToStaticMarkup(<PresentacionDeposito presentacion={b} segmentos={[]} />);
    expect(bien).not.toContain("Quedan pocas");
  });
  it("al tocarla muestra de qué pedido es lo que queda, con link", () => {
    const [, b] = repartoPorTamano(deposito, enManos);
    const html = renderToStaticMarkup(
      <PresentacionDeposito presentacion={b} segmentos={[{ texto: "todo del pedido 2/10", loteId: "x1" }]} />,
    );
    expect(html).toContain('href="/stock/lotes/x1"');
    expect(textoVisible(html)).toContain("todo del pedido 2/10");
  });
});

describe("para producir", () => {
  const stockPorInsumo = new Map([
    ["ace", 10],
    ["eti", 100],
  ]);
  const productos = [
    { id: "a", presentacion_ml: 250 },
    { id: "b", presentacion_ml: 500 },
  ];
  const recetas = [
    { producto_id: "a", insumo_id: "ace", cantidad: 0.25, tipoInsumo: "materia_prima" },
    { producto_id: "b", insumo_id: "ace", cantidad: 0.5, tipoInsumo: "materia_prima" },
    { producto_id: "b", insumo_id: "eti", cantidad: 2, tipoInsumo: "etiqueta" },
  ];
  it("calcula para cuántas alcanza cada insumo", () => {
    expect(alcancePorPresentacion({ productos, recetas, stockPorInsumo, tipo: "materia_prima" })).toEqual([
      { presentacionMl: 250, unidades: 40 },
      { presentacionMl: 500, unidades: 20 },
    ]);
    expect(alcancePorPresentacion({ productos, recetas, stockPorInsumo, tipo: "etiqueta" })).toEqual([
      { presentacionMl: 500, unidades: 50 },
    ]);
  });
  it("muestra el aceite, las etiquetas y el link a insumos", () => {
    const html = renderToStaticMarkup(
      <ParaProducir
        proveedorEn="en el proveedor"
        aceiteLitros={10}
        alcanceAceite={[{ presentacionMl: 500, unidades: 20 }]}
        aceiteValorCentavos={null}
        etiquetasRestantes={100}
        alcanceEtiqueta={[]}
      />,
    );
    const texto = textoVisible(html);
    expect(texto).toContain("10 L");
    expect(texto).toContain("alcanza para 20 ×");
    expect(texto).toContain("Ver insumos");
    expect(html).toContain('href="/stock/insumos"');
  });
});

describe("estado del pedido → pastilla", () => {
  it("falta pagar es roja (debe)", () => {
    const html = renderToStaticMarkup(
      <PastillaEstadoPedido estado={estadoPedido({ tieneCostos: true, saldoCentavos: 250_000 })} />,
    );
    expect(html).toContain("bg-accent-tint");
    expect(textoVisible(html)).toContain("Falta pagar");
  });
  it("sin costos es ámbar aunque el saldo sea 0", () => {
    const html = renderToStaticMarkup(
      <PastillaEstadoPedido estado={estadoPedido({ tieneCostos: false, saldoCentavos: 0 })} />,
    );
    expect(html).toContain("bg-warning-tint");
    expect(textoVisible(html)).toContain("Sin costos");
  });
  it("pagado es verde", () => {
    const html = renderToStaticMarkup(
      <PastillaEstadoPedido estado={estadoPedido({ tieneCostos: true, saldoCentavos: 0 })} />,
    );
    expect(html).toContain("bg-success-tint");
    expect(textoVisible(html)).toContain("Pagado");
  });
});

describe("lista de pedidos", () => {
  it("título, detalle y cuánto queda sin vender", () => {
    expect(tituloPedido("2026-10-02")).toBe("Pedido del 2 oct");
    expect(detallePedido([{ cantidad: 120, presentacionMl: 500 }, { cantidad: 80, presentacionMl: 250 }])).toBe(
      "200 botellas · 120 × 500 ml + 80 × 250 ml",
    );
    expect(textoQuedanSinVender(12)).toBe("Quedan 12 sin vender");
    expect(textoQuedanSinVender(0)).toBeNull();
    expect(textoQuedanSinVender(null)).toBeNull();
  });
  it("la fila lleva al detalle y NO muestra líneas de costo por presentación", () => {
    const html = renderToStaticMarkup(
      <FilaPedido
        loteId="p1"
        fecha="2026-10-02"
        items={[{ cantidad: 100, presentacionMl: 500 }]}
        sinVender={40}
        estado={estadoPedido({ tieneCostos: true, saldoCentavos: 100_000 })}
      />,
    );
    expect(html).toContain('href="/stock/lotes/p1"');
    const texto = textoVisible(html);
    expect(texto).toContain("Pedido del 2 oct");
    expect(texto).toContain("Quedan 40 sin vender");
    expect(texto).not.toMatch(/actualizado|vs anterior|original|calculado/);
  });
});

describe("detalle de un pedido", () => {
  it("con plata pendiente: número rojo y botón para registrar el pago", () => {
    const html = renderToStaticMarkup(<HeroePedido pedidoId="p1" tieneCostos pendienteCentavos={500_000} />);
    expect(html).toContain("text-accent");
    expect(html).toContain('href="/stock/lotes/p1/pago"');
    expect(textoVisible(html)).toContain("Registrar pago");
  });
  it("con monto 0: no es rojo, dice Pagado y no hay botón de pago", () => {
    const html = renderToStaticMarkup(<HeroePedido pedidoId="p1" tieneCostos pendienteCentavos={0} />);
    expect(html).not.toContain("text-accent");
    expect(textoVisible(html)).toContain("Pagado");
    expect(html).not.toContain("/pago");
  });
  it("sin costos: avisa en ámbar y lleva a completarlos", () => {
    const html = renderToStaticMarkup(<HeroePedido pedidoId="p1" tieneCostos={false} pendienteCentavos={0} />);
    expect(html).toContain("bg-warning-tint");
    expect(html).toContain('href="/stock/lotes/p1/costos"');
  });
  it("la tarjeta de pagos con 0 pendiente en un concepto no es roja", () => {
    const html = renderToStaticMarkup(
      <PagoPedido
        aPagarCentavos={100_000}
        pagadoCentavos={100_000}
        pagos={[]}
        conceptosPago={[
          { clave: "envase:", concepto: "envase", productoId: null, presentacionMl: null, etiqueta: "Envasado", aPagarCentavos: 100_000, pagadoCentavos: 100_000, pendienteCentavos: 0 },
        ]}
        pagadoSinConceptoCentavos={0}
        deudaAceite={null}
        litrosAceite={0}
      />,
    );
    expect(html).not.toContain("bg-accent-tint");
    expect(html).not.toContain("text-accent");
    expect(textoVisible(html)).toContain("Pagado");
  });
  it("las botellas del pedido muestran dónde están, por persona", () => {
    const html = renderToStaticMarkup(
      <BotellasPedido
        cobranza={{
          producidas: 100,
          enDeposito: 30,
          vendidas: 50,
          perdidas: 0,
          esperadoTotalCentavos: 0,
          esperadoPorVendidasCentavos: 0,
        }}
        totalEnManos={20}
        personasEnManos={[
          {
            vendedorId: "v1",
            nombre: "Sofi",
            total: 20,
            productos: [{ productoId: "a", nombre: "Botella 500 ml", presentacionMl: 500, cantidad: 20 }],
          },
        ]}
      />,
    );
    const texto = textoVisible(html);
    expect(texto).toContain("Producidas 100");
    expect(texto).toContain("Vendidas 50");
    expect(texto).toContain("En depósito 30");
    expect(texto).toContain("En revendedoras 20");
    expect(texto).toContain("Sofi");
    expect(html).toContain('href="/revendedores/v1"');
  });
  it("compara contra el pedido anterior de la MISMA presentación", () => {
    const h = (loteId: string, productoId: string, fecha: string, costo: number, tieneCostos = true) => ({
      loteId,
      productoId,
      fecha,
      createdAt: fecha,
      costoUnitarioCentavos: costo,
      tieneCostos,
    });
    const historial = [
      h("l1", "a", "2026-08-01", 100_000),
      h("l1", "b", "2026-08-01", 500_000),
      h("l2", "a", "2026-09-01", 110_000),
    ];
    expect(variacionContraAnterior(historial, "l2", "a")).toEqual({ pctCambio: 10, subio: true });
    expect(variacionContraAnterior(historial, "l1", "a")).toBeNull();
    expect(variacionContraAnterior(historial, "l2", "b")).toBeNull();
    expect(variacionContraAnterior([h("l1", "a", "2026-08-01", 100_000, false), h("l2", "a", "2026-09-01", 50_000)], "l2", "a")).toBeNull();
  });
});

describe("insumos", () => {
  it("textos de cantidad y de alcance", () => {
    expect(textoCantidadInsumo(12, "litro")).toBe("12 litros");
    expect(textoCantidadInsumo(1, "litro")).toBe("1 litro");
    expect(textoCantidadInsumo(30, "unidad")).toBe("30 unidades");
    expect(textoAlcance([{ presentacionMl: 500, unidades: 20 }])).toBe("alcanza para 20 × 500 ml");
  });
  it("queda poco → pastilla ámbar; en regla → sin pastilla", () => {
    const poco = renderToStaticMarkup(
      <FilaInsumo id="i1" nombre="Aceite" stock={4} unidad="litro" bajoUmbral alcance={[{ presentacionMl: 500, unidades: 8 }]} />,
    );
    expect(poco).toContain("Queda poco");
    expect(poco).toContain("bg-warning-tint");
    expect(textoVisible(poco)).toContain("4 litros · alcanza para 8 × 500 ml");
    const bien = renderToStaticMarkup(<FilaInsumo id="i2" nombre="Etiqueta" stock={50} unidad="unidad" bajoUmbral={false} />);
    expect(bien).not.toContain("Queda poco");
  });
});

describe("la palabra 'lote' no se ve", () => {
  it("en las vistas del sector", () => {
    const vistas = [
      renderToStaticMarkup(<HeroePedido pedidoId="p1" tieneCostos pendienteCentavos={1000} />),
      renderToStaticMarkup(
        <FilaPedido loteId="p1" fecha="2026-10-02" items={[{ cantidad: 5, presentacionMl: 500 }]} sinVender={3} estado={estadoPedido({ tieneCostos: true, saldoCentavos: 0 })} />,
      ),
      renderToStaticMarkup(<LoteLink loteId="x" fecha="2026-10-21" />),
      renderToStaticMarkup(<LoteLink loteId="x" fecha={null} />),
      renderToStaticMarkup(<LoteLink loteId={null} fecha={null} />),
      renderToStaticMarkup(<HeroeBotellas deposito={1} revendedoras={2} />),
    ];
    for (const html of vistas) expect(textoVisible(html)).not.toMatch(LOTE);
  });
  it("en los mensajes que ve el usuario", () => {
    expect(rotuloLoteVenta({ loteId: "a", fecha: "2026-09-05", quedan: 12 } as never)).not.toMatch(LOTE);
    for (const msg of ["P0001", "LOTE_INVALIDO", "STOCK_LOTE_INSUFICIENTE"].map((m) => mensajeErrorLote(m, null))) {
      expect(String(msg)).not.toMatch(LOTE);
    }
  });
  it("el rótulo de un pedido se arma con la fecha", () => {
    expect(textoVisible(renderToStaticMarkup(<LoteLink loteId="x" fecha="2026-10-21" />))).toContain("Pedido del 21/10");
  });
});

describe("botones de la ficha de revendedora", () => {
  it("llevan al mismo destino de siempre", () => {
    expect(hrefsAcciones("abc")).toEqual({
      entregar: "/revendedores/abc/carga?seccion=entrega",
      pago: "/revendedores/abc/carga?seccion=pago",
      venta: "/revendedores/abc/carga?seccion=ventas",
      devolucion: "/revendedores/abc/devolucion",
    });
  });
  it("entregar es el principal, pago y venta van en dos columnas y devolución es un link de texto", () => {
    const html = renderToStaticMarkup(<AccionesFicha vendedorId="abc" />);
    const href = hrefsAcciones("abc");
    for (const h of Object.values(href)) expect(html).toContain(`href="${h}"`);
    expect(html).toContain("grid-cols-2");
    expect(html).not.toContain("grid-cols-3");
    // Una sola línea: el texto de los secundarios no se parte.
    expect(html).toContain("whitespace-nowrap");
    // Devolución: al menos 44px de alto, sin forma de botón.
    const devolucion = html.slice(html.indexOf(`href="${href.devolucion}"`));
    expect(devolucion).toContain("min-h-11");
    expect(devolucion).not.toContain("border ");
  });
});
