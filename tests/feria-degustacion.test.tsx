// Degustación de feria a cargo de Ananja (0079): lógica pura y pantallas. Datos inventados.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/ferias",
}));

vi.mock("@/components/page-header-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/page-header-context")>()),
  SetFormHeader: () => null,
}));

import { DetalleFeria } from "@/components/ferias/detalle-feria";
import { FeriaInicioTarjeta } from "@/components/mi/feria-inicio-tarjeta";
import { FeriaMiVista, type FeriaMiDatos } from "@/components/mi/feria-vista";
import { PageHeaderProvider } from "@/components/page-header-context";
import { EntregaForm } from "@/components/revendedores/entrega-form";
import { FormularioEntrega } from "@/components/revendedores/entrega/formulario-entrega";
import { textoDegustacionMi } from "@/lib/dominio/feria-mi";
import {
  itemsDegustacionFeria,
  sePuedeQuitar,
  textoDegustacion,
  textoParaVenderYDegustar,
  totalDegustacion,
} from "@/lib/dominio/feria-admin";
import type { Tables } from "@/lib/types";

const productos = [
  { id: "a", nombre: "Aceite 250" },
  { id: "b", nombre: "Aceite 500" },
] as Tables<"productos">[];

describe("lógica de degustación de feria", () => {
  it("arma los items con el primer pedido elegido para cada producto", () => {
    const items = itemsDegustacionFeria(
      { a: 2, b: 1, c: 0 },
      [
        { producto_id: "a", lote_id: undefined },
        { producto_id: "a", lote_id: "lote-1" },
        { producto_id: "a", lote_id: "lote-2" },
        { producto_id: "b" },
      ],
    );
    expect(items).toEqual([
      { productoId: "a", cantidad: 2, loteId: "lote-1" },
      { productoId: "b", cantidad: 1, loteId: null },
    ]);
  });

  it("sin entrega (solo degustación) no hay pedido elegido; ignora cantidades inválidas", () => {
    expect(itemsDegustacionFeria({ a: 3, b: -1, c: 1.5 }, [])).toEqual([
      { productoId: "a", cantidad: 3, loteId: null },
    ]);
    expect(totalDegustacion({ a: 3, b: 0, c: 2 })).toBe(5);
  });

  it("textos", () => {
    expect(textoParaVenderYDegustar(5, 0)).toBe("5 para vender");
    expect(textoParaVenderYDegustar(5, 2)).toBe("5 para vender · 2 para degustación (a cargo de Ananja)");
    expect(textoDegustacion(0, 0)).toBeNull();
    expect(textoDegustacion(1, 0)).toBe("1 cargada");
    expect(textoDegustacion(0, 2)).toBe("2 en el cierre");
    expect(textoDegustacion(3, 1)).toBe("4 (3 cargadas · 1 en el cierre)");
    expect(textoDegustacionMi(0, 2)).toBe("2");
    expect(textoDegustacionMi(3, 0)).toBe("3 de Ananja");
    expect(textoDegustacionMi(3, 1)).toBe("4 (3 de Ananja · 1 en el cierre)");
  });

  it("con degustación cargada no se puede quitar a la participante", () => {
    expect(sePuedeQuitar({ estado: "pendiente", entregadas: 0, degustadas_carga: 2 })).toBe(false);
    expect(sePuedeQuitar({ estado: "pendiente", entregadas: 0, degustadas_carga: 0 })).toBe(true);
  });
});

describe("cargar botellas en modo feria", () => {
  const html = renderToStaticMarkup(
    <PageHeaderProvider>
      <EntregaForm
        vendedorId="ana"
        vendedorNombre="Ana"
        productos={productos}
        tipoInicial="entrega"
        lotesConStock={[]}
        feriaId="f1"
      />
    </PageHeaderProvider>,
  );

  it("muestra el campo Para degustación por producto", () => {
    expect(html.match(/Para degustación/g)?.length).toBe(2);
    expect(html).toContain("Cantidad de Aceite 250 para degustación");
  });

  it("sin feria el formulario no cambia: no hay campo de degustación", () => {
    const sin = renderToStaticMarkup(
      <PageHeaderProvider>
        <EntregaForm
          vendedorId="ana"
          vendedorNombre="Ana"
          productos={productos}
          tipoInicial="entrega"
          lotesConStock={[]}
        />
      </PageHeaderProvider>,
    );
    expect(sin).not.toContain("degustación");
  });

  it("debajo del producto resume cuántas son para vender y cuántas para degustación", () => {
    const conCantidades = renderToStaticMarkup(
      <FormularioEntrega
        revisando={false}
        vendedorNombre="Ana"
        soloDevolucion={false}
        soloEntrega
        tipo="entrega"
        onCambiarTipo={() => {}}
        productos={productos}
        cantidades={{ a: 5, b: 0 }}
        onCambiarCantidad={() => {}}
        degustacion={{ a: 2 }}
        onCambiarDegustacion={() => {}}
        devolucion={{}}
        onCambiarDevolucion={() => {}}
        onDevolverTodo={() => {}}
        onDevolverTodoDeProducto={() => {}}
        lotesConStock={[]}
        ultimoLotePorProducto={{}}
        onLotesChange={() => {}}
        fecha="2026-11-08"
        onCambiarFecha={() => {}}
        nota=""
        onCambiarNota={() => {}}
        error={null}
        saving={false}
        onSubmit={() => {}}
        cancelarHref="/ferias/f1"
      />,
    );
    expect(conCantidades).toContain("5 para vender · 2 para degustación (a cargo de Ananja)");
  });
});

describe("detalle de la feria con degustación", () => {
  const part = {
    feria_id: "f1",
    vendedor_id: "v1",
    vendedor_nombre: "Ana",
    estado: "pendiente",
    cerrada_at: null,
    entregadas: 10,
    devueltas: 0,
    degustadas: 4,
    degustadas_carga: 3,
    degustadas_cierre: 1,
    vendidas: 0,
    faltan: 10,
    total_vendido_centavos: 0,
    costo_centavos: 0,
    efectivo_centavos: 0,
    mercado_pago_centavos: 0,
    banco_centavos: 0,
  };
  const fila = {
    feria_id: "f1",
    vendedor_id: "v1",
    producto_id: "a",
    producto_nombre: "Aceite 250",
    entregadas: 10,
    vendidas: 0,
    devueltas: 0,
    degustadas: 4,
    degustadas_carga: 3,
    degustadas_cierre: 1,
    precio_feria_centavos: 1000,
  };
  const html = renderToStaticMarkup(
    <DetalleFeria
      feria={{ id: "f1", admin_id: null, created_at: "", nota: null, lugar: null, nombre: "Feria X", estado: "abierta", fecha: "2026-11-01" }}
      participantes={[part]}
      productosPorPersona={{ v1: [fila] }}
      revendedoras={[{ id: "v1", nombre: "Ana" }]}
      productosActivos={[{ id: "a", nombre: "Aceite 250" }]}
      avisoDegustacion="Las botellas se cargaron, pero la degustación no: x. Cargala desde la ficha de la feria."
    />,
  );

  it("desglosa la degustación y ofrece cargar y quitar", () => {
    expect(html).toContain("Degustación: 4 (3 cargadas · 1 en el cierre)");
    expect(html).toContain("Cargar degustación");
    expect(html).toContain("Aceite 250: 3 para degustación (a cargo de Ananja)");
    expect(html).toContain(">Quitar<");
    expect(html).toContain("Las botellas se cargaron, pero la degustación no");
  });

  it("el total de la feria suma la degustación", () => {
    expect(html).toContain("4 para degustación");
  });
});

describe("lado de la revendedora con degustación cargada", () => {
  const datos: FeriaMiDatos = {
    nombre: "Palermo",
    fecha: "2026-11-08",
    lugar: null,
    cerrada: false,
    productos: [
      { productoId: "a", nombre: "Aceite 250", entregadas: 10, vendidas: 0, devueltas: 0, degustadas: 3, degustadasCarga: 3, degustadasCierre: 0, precioFeriaCentavos: 1500000 },
    ],
    totalVendidoCentavos: 0,
    efectivoCentavos: 0,
    mercadoPagoCentavos: 0,
    bancoCentavos: 0,
  };

  it("/mi/feria separa lo que va para vender de la degustación de Ananja", () => {
    const html = renderToStaticMarkup(<FeriaMiVista feria={datos} />);
    expect(html).toContain("10 para vender");
    expect(html).toContain("3 para degustación (a cargo de Ananja)");
  });

  it("cerrada: degustación con desglose", () => {
    const html = renderToStaticMarkup(
      <FeriaMiVista
        feria={{
          ...datos,
          cerrada: true,
          productos: [{ ...datos.productos[0], vendidas: 7, degustadas: 4, degustadasCierre: 1 }],
        }}
      />,
    );
    expect(html).toContain("degustación 4 (3 de Ananja · 1 en el cierre)");
  });

  it("tarjeta de Inicio", () => {
    const base = { nombre: "Palermo", fecha: "2026-11-08", lugar: null, accion: "cerrar" as const, llevadas: 10, vendidas: 0, devueltas: 0 };
    expect(renderToStaticMarkup(<FeriaInicioTarjeta feria={{ ...base, degustadasCarga: 3 }} />)).toContain(
      "3 para degustación",
    );
    expect(renderToStaticMarkup(<FeriaInicioTarjeta feria={base} />)).not.toContain("degustación");
  });
});
