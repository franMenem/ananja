// Estado inicial de VentasFiltradas (render estático: el repo no tiene Testing
// Library, así que los clicks se cubren en filtro-ventas-mi.test.ts).
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

import { VentasFiltradas } from "@/components/mi/ventas-filtradas";
import type { MesVentasMi } from "@/lib/dominio/filtro-ventas-mi";

const venta = (id: string, medioPago: "efectivo" | "banco" | null) => ({
  id,
  fecha: "2026-10-05",
  productoNombre: "Aceite",
  cantidad: 2,
  totalCentavos: 100000,
  medioPago,
});

describe("VentasFiltradas", () => {
  it("muestra el renglón del filtro activo, la tarjeta resumen y todas las ventas; la hoja está cerrada", () => {
    const meses: MesVentasMi[] = [{ periodo: "2026-10", ventas: [venta("a", "efectivo"), venta("b", "banco")] }];
    const html = renderToStaticMarkup(<VentasFiltradas meses={meses} hoy="2026-10-20" />);
    expect(html).toContain("Todo el tiempo · Todos los medios");
    expect(html).toContain("Filtrar");
    expect(html).toContain("4 botellas");
    expect(html).toContain("4 × Aceite");
    expect(html).toContain("/mi/ventas/a");
    expect(html).toContain("/mi/ventas/b");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Aplicar");
    expect(html).not.toContain("Sin cargar");
  });

  it("sin ventas muestra el mensaje y no los chips", () => {
    const html = renderToStaticMarkup(<VentasFiltradas meses={[]} hoy="2026-10-20" />);
    expect(html).toContain("Todavía no cargaste ventas.");
    expect(html).not.toContain("Filtrar");
  });
});
