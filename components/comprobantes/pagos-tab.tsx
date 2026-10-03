import {
  PagosRevendedorList,
  type PagoRevendedorItem,
} from "@/components/comprobantes/pagos-revendedor-list";
import { listarPagosRevendedor } from "@/lib/data/pagos-revendedor";
import { pagoRevendedorFila } from "@/lib/dominio/pagos-revendedor";
import { esPathPdf, getSignedUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Pestaña "Pagos de revendedores" de `/comprobantes`: los pagos que las
 * revendedoras informan desde `/mi/pagar`, con la foto del comprobante.
 * Cada fila lleva al detalle (`/tareas/pagos/[id]`), donde se confirma o
 * rechaza.
 */
export async function PagosTab() {
  const supabase = await createClient();
  const { data, error } = await listarPagosRevendedor(supabase);

  const filas = data.map(pagoRevendedorFila);
  // Los pagos en efectivo no tienen foto (`imagen_path` null): quedan afuera
  // de las URLs firmadas y la fila muestra el ícono de reemplazo.
  const paths = filas.map((f) => f.imagenPath).filter((p): p is string => p !== null);
  const signedUrls = await getSignedUrls(paths, 3600, supabase);

  const items: PagoRevendedorItem[] = filas.map((fila) => ({
    ...fila,
    isPdf: fila.imagenPath !== null && esPathPdf(fila.imagenPath),
    signedUrl: fila.imagenPath !== null ? (signedUrls[fila.imagenPath] ?? null) : null,
  }));

  const pendientes = filas.filter((f) => f.estado === "pendiente").length;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          {filas.length} {filas.length === 1 ? "pago" : "pagos"}
          {pendientes > 0 ? ` · ${pendientes} por confirmar` : ""}
        </span>
        <h1 className="font-display hidden text-[38px] leading-[1.05] text-primary md:block">
          Pagos de revendedores
        </h1>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : (
        <PagosRevendedorList rows={items} />
      )}
    </div>
  );
}
