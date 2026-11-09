// Editar una venta propia (0077): regla de pantalla, formulario precargado y
// forma de la migración. Datos inventados.
import { readFileSync } from "node:fs";
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
  usePathname: () => "/mi/ventas/v1/editar",
}));

vi.mock("@/components/page-header-context", () => ({ SetFormHeader: () => null }));

import { EditarVentaForm } from "@/components/mi/editar-venta-form";
import { puedeBorrarVentaRevendedor, puedeEditarVentaRevendedor } from "@/lib/dominio/ventas-revendedor";

const base = { esAdmin: false, miVendedorId: "yo", vendedorId: "yo", registradaPor: null };

describe("puedeEditarVentaRevendedor", () => {
  it("la dueña edita su venta, cargada por ella o sin registrar", () => {
    expect(puedeEditarVentaRevendedor(base)).toBe(true);
    expect(puedeEditarVentaRevendedor({ ...base, registradaPor: "yo" })).toBe(true);
  });

  it("no edita la que cargó un admin ni la de otra persona", () => {
    expect(puedeEditarVentaRevendedor({ ...base, registradaPor: "admin" })).toBe(false);
    expect(puedeEditarVentaRevendedor({ ...base, vendedorId: "otra" })).toBe(false);
  });

  it("un admin edita cualquiera y coincide con la regla de borrar", () => {
    const admin = { ...base, esAdmin: true, vendedorId: "otra", registradaPor: "x" };
    expect(puedeEditarVentaRevendedor(admin)).toBe(true);
    expect(puedeEditarVentaRevendedor(admin)).toBe(puedeBorrarVentaRevendedor(admin));
  });
});

describe("EditarVentaForm", () => {
  const html = renderToStaticMarkup(
    <EditarVentaForm
      ventaId="v1"
      grupoId="g1"
      producto="Aceite de oliva"
      cantidad={3}
      medioPago="efectivo"
      precioVentaCentavos={1250000}
      fecha="2026-10-05"
      nota="Pagó en mano"
    />,
  );

  it("muestra producto y cantidad como texto y precarga los valores", () => {
    expect(html).toContain("Aceite de oliva");
    expect(html).toContain(">3<");
    expect(html).toContain('value="2026-10-05"');
    expect(html).toContain("Pagó en mano");
    expect(html).toContain("12.500");
    expect(html).toContain('aria-pressed="true"');
  });

  it("guarda con 'Guardar cambios', cancela al detalle y avisa lo de la cantidad", () => {
    expect(html).toContain("Guardar cambios");
    expect(html).toContain('href="/mi/ventas/v1"');
    expect(html).toContain("Para cambiar la cantidad, borrá la venta y cargala de nuevo.");
  });

  it("no usa la palabra lote", () => {
    expect(html.toLowerCase()).not.toContain("lote");
  });
});

describe("migración 0077", () => {
  const sql = readFileSync("supabase/migrations/0077_editar_venta_revendedor.sql", "utf8");

  it("cumple las reglas del repo", () => {
    expect(sql).toContain("set search_path = public");
    expect(sql).not.toContain("search_path = 'public'");
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/revoke execute on function public\.editar_venta_revendedor/);
    expect(sql).toMatch(/grant execute on function public\.editar_venta_revendedor[\s\S]*to authenticated/);
  });

  it("valida lo pedido", () => {
    for (const codigo of [
      "NO_AUTORIZADO",
      "VENTA_NO_ENCONTRADA",
      "VENTA_CON_RENDICION",
      "MEDIO_INVALIDO",
      "PRECIO_INVALIDO",
      "FECHA_INVALIDA",
      "FECHA_FUTURA",
      "FECHA_ANTERIOR_A_ENTREGA",
    ]) {
      expect(sql).toContain(`'${codigo}'`);
    }
    expect(sql).toContain("for no key update");
  });
});
