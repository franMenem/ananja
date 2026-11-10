// Feria de la revendedora: pantalla /mi/feria, form de cierre, tarjeta de Inicio y reglas de venta. Datos inventados.
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
  usePathname: () => "/mi/feria/cerrar",
}));

import { FeriaInicioTarjeta } from "@/components/mi/feria-inicio-tarjeta";
import { FeriaMiVista, textoDiferencia, type FeriaMiDatos } from "@/components/mi/feria-vista";
import { accionFeriaInicio } from "@/lib/dominio/feria-mi";
import { puedeBorrarVentaRevendedor, puedeEditarVentaRevendedor } from "@/lib/dominio/ventas-revendedor";

const pendiente: FeriaMiDatos = {
  nombre: "Palermo",
  fecha: "2026-11-08",
  lugar: "Plaza Italia",
  cerrada: false,
  productos: [
    { productoId: "a", nombre: "Aceite 250", entregadas: 10, vendidas: 2, devueltas: 0, degustadas: 0, degustadasCarga: 0, degustadasCierre: 0, precioFeriaCentavos: 1500000 },
    { productoId: "b", nombre: "Aceite 500", entregadas: 4, vendidas: 0, devueltas: 0, degustadas: 0, degustadasCarga: 0, degustadasCierre: 0, precioFeriaCentavos: 2800000 },
  ],
  totalVendidoCentavos: 0,
  efectivoCentavos: 0,
  mercadoPagoCentavos: 0,
  bancoCentavos: 0,
};

describe("FeriaMiVista", () => {
  it("sin feria dice que no hay ninguna", () => {
    expect(renderToStaticMarkup(<FeriaMiVista feria={null} />)).toContain("No tenés ninguna feria en curso.");
  });

  it("pendiente: lo que se llevó, ya vendidas y botón para cerrar", () => {
    const html = renderToStaticMarkup(<FeriaMiVista feria={pendiente} />);
    expect(html).toContain("Feria Palermo");
    expect(html).toContain("Plaza Italia");
    expect(html).toContain("Lo que te llevaste");
    expect(html).toContain("Ya vendiste 2");
    expect(html).toContain("15.000");
    expect(html).toContain('href="/mi/feria/cerrar"');
    expect(html.toLowerCase()).not.toContain("lote");
  });

  it("cerrada: resumen, plata por medio, diferencia y aviso de reabrir", () => {
    const html = renderToStaticMarkup(
      <FeriaMiVista
        feria={{
          ...pendiente,
          cerrada: true,
          productos: [
            { productoId: "a", nombre: "Aceite 250", entregadas: 10, vendidas: 7, devueltas: 2, degustadas: 1, degustadasCarga: 0, degustadasCierre: 1, precioFeriaCentavos: 1500000 },
          ],
          totalVendidoCentavos: 10500000,
          efectivoCentavos: 10000000,
          mercadoPagoCentavos: 0,
          bancoCentavos: 0,
        }}
      />,
    );
    expect(html).toContain("Ya cerraste tu feria");
    expect(html).toContain("Vendiste 7");
    expect(html).toContain("Te faltan");
    expect(html).toContain("Si algo está mal, pedile a un admin que reabra tu participación.");
    expect(html).not.toContain("/mi/feria/cerrar");
    expect(html.toLowerCase()).not.toContain("lote");
  });

  it("textoDiferencia", () => {
    expect(textoDiferencia(0)).toBe("Cuadra justo");
    expect(textoDiferencia(-500000)).toContain("Te faltan");
    expect(textoDiferencia(500000)).toContain("Te sobran");
  });
});

describe("tarjeta de Inicio", () => {
  const base = { nombre: "Palermo", fecha: "2026-11-08", lugar: null, llevadas: 14, vendidas: 9, devueltas: 4 };

  it("accionFeriaInicio", () => {
    expect(accionFeriaInicio("pendiente", "2026-11-08", "2026-11-09")).toBe("cerrar");
    expect(accionFeriaInicio("pendiente", "2026-11-09", "2026-11-09")).toBe("cerrar");
    expect(accionFeriaInicio("pendiente", "2026-11-10", "2026-11-09")).toBe("ver");
    expect(accionFeriaInicio("cerrada", "2026-11-08", "2026-11-09")).toBe("cerrada");
  });

  it("pendiente ofrece cerrar; cerrada, ver el resumen", () => {
    const a = renderToStaticMarkup(<FeriaInicioTarjeta feria={{ ...base, accion: "cerrar" }} />);
    expect(a).toContain("Te llevaste 14");
    expect(a).toContain("Cerrar mi feria");
    expect(a).toContain('href="/mi/feria/cerrar"');
    const b = renderToStaticMarkup(<FeriaInicioTarjeta feria={{ ...base, accion: "cerrada" }} />);
    expect(b).toContain("Ya cerraste tu feria");
    expect(b).toContain("vendiste 9");
    expect(b).toContain('href="/mi/feria"');
  });
});

describe("ventas de feria", () => {
  const venta = { esAdmin: false, miVendedorId: "yo", vendedorId: "yo", registradaPor: null };

  it("la revendedora no edita ni borra una venta de feria", () => {
    expect(puedeEditarVentaRevendedor({ ...venta, feriaId: "f1" })).toBe(false);
    expect(puedeBorrarVentaRevendedor({ ...venta, feriaId: "f1" })).toBe(false);
  });

  it("sin feria sigue igual y el admin siempre puede", () => {
    expect(puedeEditarVentaRevendedor({ ...venta, feriaId: null })).toBe(true);
    expect(puedeBorrarVentaRevendedor({ ...venta, esAdmin: true, feriaId: "f1" })).toBe(true);
  });
});
