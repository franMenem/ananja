import { BOTON_PRIMARIO } from "@/components/ui/boton";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CobrosList } from "@/components/cobros/cobros-list";
import { ComprobanteDeleteButton } from "@/components/comprobante-delete-button";
import { IconReceipt } from "@/components/icons";
import { Pastilla } from "@/components/ui/pastilla";
import { VolverLink } from "@/components/volver-link";
import {
  listarCobrosDeComprobante,
  obtenerComprobante,
  obtenerSaldoComprobante,
} from "@/lib/data/comprobantes";
import { etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";
import { formatFecha, formatFechaSinAnio } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion } from "@/lib/negocio";
import { getSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export default async function ComprobanteDetailPage({
  params,
}: PageProps<"/comprobantes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [comprobante, saldo, { data: cobros }] = await Promise.all([
    obtenerComprobante(supabase, id),
    obtenerSaldoComprobante(supabase, id),
    listarCobrosDeComprobante(supabase, id),
  ]);

  if (!comprobante) notFound();

  const cobradoTotalCentavos = saldo?.cobrado_total_centavos ?? comprobante.monto_centavos;
  const deudaCentavos = saldo?.deuda_centavos ?? 0;

  // La foto es opcional (ej. ventas a crédito), así que `imagen_path`
  // puede venir null. Sin foto no hay nada que firmar ni PDF que detectar.
  const imagenPath = comprobante.imagen_path;
  const hasImagen = imagenPath !== null;
  const isPdf = imagenPath !== null && isPdfPath(imagenPath);
  const signedUrl =
    imagenPath !== null
      ? await getSignedUrl(imagenPath, 3600, supabase)
      : null;

  const items = [...comprobante.comprobante_items].sort(
    (a, b) =>
      (b.productos?.presentacion_ml ?? 0) - (a.productos?.presentacion_ml ?? 0),
  );

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/comprobantes" label="comprobantes" />

        <div className="flex flex-col gap-1">
          <span className="text-[14px] text-text-muted">
            {formatFecha(comprobante.fecha)} ·{" "}
            {etiquetaMedioPago(comprobante.medio_pago)} ·{" "}
            {comprobante.vendedores?.nombre ?? "—"}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-display text-[clamp(28px,9vw,40px)] leading-none text-text tabular-nums">
              {formatCentavos(comprobante.monto_centavos)}
            </span>
            {deudaCentavos > 0 && (
              <Pastilla variante="debe">Debe {formatCentavos(deudaCentavos)}</Pastilla>
            )}
          </div>
        </div>

        {!hasImagen ? (
          <div className="flex min-h-32 items-center justify-center border border-border bg-surface-raised p-6 text-[16px] text-accent rounded-2xl">
            Sin comprobante
          </div>
        ) : isPdf ? (
          <a
            href={signedUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-32 flex-col items-center justify-center gap-2.5 border border-border bg-surface-raised p-6 text-center rounded-2xl"
          >
            <IconReceipt className="h-9 w-9 text-text-muted" />
            <span className="text-[14px] font-medium text-primary">
              Ver PDF del comprobante
            </span>
          </a>
        ) : signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt="Comprobante"
            className="max-h-[70vh] w-full border border-border object-contain"
          />
        ) : (
          <div className="flex min-h-32 items-center justify-center border border-border bg-surface-raised p-6 text-[16px] text-text-muted rounded-2xl">
            No se pudo cargar la imagen.
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-[16px] text-text">
          <p>
            {items
              .map((item) => {
                // Un mismo producto puede aparecer en más de una fila
                // cuando cada una sale de un lote distinto
                // (comprobante_items.lote_id, ver
                // supabase/migrations/0028_costos_por_lote.sql) — se
                // itemiza cada fila con su propio lote en vez de agruparlas,
                // así queda claro de dónde salió cada una.
                const base = `${item.cantidad}×${formatPresentacion(item.productos?.presentacion_ml)}`;
                const lote = item.lotes_produccion?.fecha
                  ? ` (pedido ${formatFechaSinAnio(item.lotes_produccion.fecha)})`
                  : "";
                return `${base}${lote}`;
              })
              .join(" + ")}
          </p>

          {comprobante.clientes && (
            <p className="text-text-muted">
              Cliente:{" "}
              <Link
                href={`/clientes/${comprobante.clientes.id}`}
                className="font-medium text-primary"
              >
                {comprobante.clientes.nombre}
              </Link>
            </p>
          )}

          {comprobante.nota && (
            <p className="text-text-muted">Nota: {comprobante.nota}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-muted">
              Cobrado / Debe
            </span>
            <span className="text-[16px] font-medium tabular-nums text-text">
              {formatCentavos(cobradoTotalCentavos)}
              {deudaCentavos > 0 && (
                <span className="ml-2 text-accent">
                  Debe {formatCentavos(deudaCentavos)}
                </span>
              )}
            </span>
          </div>

          <CobrosList
            cobros={(cobros ?? []).map((cobro) => ({
              id: cobro.id,
              montoCentavos: cobro.monto_centavos,
              medioPago: cobro.medio_pago,
              fecha: cobro.fecha,
              nota: cobro.nota,
            }))}
          />

          {deudaCentavos > 0 && (
            <Link
              href={`/comprobantes/${id}/cobro`}
              className="flex min-h-11 items-center justify-center border border-primary px-4 text-[14px] font-medium text-primary rounded-xl"
            >
              Registrar cobro
            </Link>
          )}
        </div>

        <div className="flex gap-2.5">
          <Link
            href={`/comprobantes/${id}/editar`}
            className={`${BOTON_PRIMARIO} flex flex-1 px-4`}
          >
            Editar
          </Link>
          <ComprobanteDeleteButton
            comprobanteId={id}
            cobradoAlMomentoCentavos={comprobante.cobrado_centavos}
            medioPago={comprobante.medio_pago}
            cobros={(cobros ?? []).map((cobro) => ({
              montoCentavos: cobro.monto_centavos,
              medioPago: cobro.medio_pago,
            }))}
            items={items.map((item) => ({
              cantidad: item.cantidad,
              presentacionMl: item.productos?.presentacion_ml ?? null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
