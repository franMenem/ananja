import { ProveedorProvider } from "@/components/stock/proveedor-context";
import { leerProveedorNombre } from "@/lib/proveedor-servidor";

/**
 * Todo `/stock/*` comparte el nombre del proveedor (configurable desde
 * `/stock/proveedor`, migración 0069). Los componentes cliente lo leen con
 * `useProveedor()`; las páginas de servidor, con `leerFormasProveedor()`
 * (misma lectura memoizada por request). `router.refresh()` después de
 * guardar re-renderiza este layout, así el nombre nuevo se ve sin recargar.
 */
export default async function StockLayout({ children }: LayoutProps<"/stock">) {
  const nombre = await leerProveedorNombre();
  return <ProveedorProvider nombre={nombre}>{children}</ProveedorProvider>;
}
