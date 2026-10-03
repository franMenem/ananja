import { FormPage } from "@/components/app/form-page";
import { CompraFacturaForm } from "@/components/stock/compra-factura-form";

/**
 * "Cargar compra" (tanda produccion-simple — antes "Cargar factura"):
 * sirve tanto para una factura con varias líneas de insumos + IVA + envío
 * como para una compra suelta de un solo insumo (`CompraFacturaForm`
 * funciona cómodo con un solo renglón, sin envío y sin el IVA extra si se
 * destilda el checkbox). Reemplaza a `/stock/insumos/compra`, que se
 * borró (redirect permanente en `next.config.ts`).
 */
export default async function CargarCompraPage({
  searchParams,
}: PageProps<"/stock/insumos/factura">) {
  const params = await searchParams;
  const insumoParam = Array.isArray(params.insumo) ? params.insumo[0] : params.insumo;

  return (
    <FormPage title="Cargar compra" backHref="/stock/insumos" backLabel="Volver a insumos">
      <p className="text-[12px] leading-snug text-text-muted">
        Una factura con varios renglones, o una compra suelta de un solo insumo.
      </p>
      <CompraFacturaForm insumoInicial={insumoParam} />
    </FormPage>
  );
}
