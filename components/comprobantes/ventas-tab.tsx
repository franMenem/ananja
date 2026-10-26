import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
import {
  ComprobantesList,
  type ComprobanteRow,
} from "@/components/comprobantes-list";
import { resumenMesComprobantes } from "@/lib/dominio/comprobantes";
import { listarComprobantes, listarSaldosComprobantes } from "@/lib/data/comprobantes";
import { etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";
import { partesFechaHoraArgentina } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, capitalizar, formatCantidadesPorPresentacion } from "@/lib/negocio";
import { esPathPdf, getSignedUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// `timeZone` explícito: sin él, `Intl.DateTimeFormat` usa el huso del
// runtime (UTC en Vercel), y el nombre del mes podía adelantarse cerca del
// cambio de mes en horario de Argentina (mismo bug de fondo que `mesActual`
// más abajo).
const MES_LARGO = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  month: "long",
});

/**
 * Pestaña "Ventas" de `/comprobantes`: cobrado del mes (número héroe, con
 * las demás métricas al lado en escritorio) y la lista de comprobantes de
 * venta directa.
 */
export async function VentasTab() {
  const supabase = await createClient();

  const [{ data: comprobantes }, { data: saldos }] = await Promise.all([
    listarComprobantes(supabase),
    listarSaldosComprobantes(supabase),
  ]);

  const rows = comprobantes ?? [];
  const deudaPorComprobante = new Map<string, number>(
    (saldos ?? []).map((s) => [s.comprobante_id ?? "", s.deuda_centavos ?? 0]),
  );
  // `imagen_path` puede venir null (foto opcional en ventas a crédito) —
  // se excluye de las signed URLs y esas filas quedan con el ícono de
  // reemplazo (ver ComprobanteThumb en comprobantes-list.tsx).
  const paths = rows
    .map((r) => r.imagen_path)
    .filter((p): p is string => p !== null);
  const signedUrls = await getSignedUrls(paths, 3600, supabase);

  const listRows: ComprobanteRow[] = rows.map((comprobante) => ({
    id: comprobante.id,
    montoCentavos: comprobante.monto_centavos,
    debeCentavos: deudaPorComprobante.get(comprobante.id) ?? 0,
    medioPago: comprobante.medio_pago,
    fecha: comprobante.fecha,
    isPdf: comprobante.imagen_path !== null && esPathPdf(comprobante.imagen_path),
    tieneImagen: comprobante.imagen_path !== null,
    signedUrl:
      comprobante.imagen_path !== null
        ? (signedUrls[comprobante.imagen_path] ?? null)
        : null,
    cantidadesLabel: formatCantidadesPorPresentacion(comprobante.comprobante_items),
    vendedorNombre: comprobante.vendedores?.nombre ?? null,
    clienteNombre: comprobante.clientes?.nombre ?? null,
  }));

  // Franja oliva de métricas del mes actual (design/handoff README § /comprobantes —
  // "opcional, si no se quiere calcular se saca la franja"). Se calcula acá
  // sobre los datos ya traídos, sin agregados nuevos en la base.
  const hoy = new Date();
  // Mes de Argentina (`lib/fechas.ts`), no del runtime — en un Server
  // Component sobre Vercel (UTC) `getFullYear()/getMonth()` corren el mes
  // entre las 21:00 y 23:59 ART, sobre todo el último día del mes.
  const { anio: anioHoyArg, mes: mesHoyArg } = partesFechaHoraArgentina(hoy);
  const mesActual = `${anioHoyArg}-${String(mesHoyArg + 1).padStart(2, "0")}`;
  const {
    cantidad: cantidadMes,
    totalCentavos: totalMesCentavos,
    unidades: unidadesMes,
    ticketPromedioCentavos,
    medioMasUsado: medioMasUsadoValor,
  } = resumenMesComprobantes(rows, mesActual);
  const medioMasUsado = etiquetaMedioPago(medioMasUsadoValor);
  const nombreMes = MES_LARGO.format(hoy);

  return (
    <div className="flex flex-col gap-5">
      {/* Número héroe: cobrado en el mes. En escritorio, al lado, el resto
          de las métricas del mes. */}
      <Tarjeta className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-10">
        <div className="flex min-w-0 flex-col gap-1">
          <NumeroGrande etiqueta={`Cobrado en ${nombreMes.toLowerCase()}`}>
            {formatCentavos(totalMesCentavos)}
          </NumeroGrande>
          <span className="text-[14px] text-text-muted">
            {cantidadMes} {cantidadMes === 1 ? "registro" : "registros"} este mes
          </span>
        </div>
        <dl className="hidden flex-wrap gap-x-8 gap-y-2 md:flex">
          <div className="flex min-w-[70px] flex-col">
            <dt className="text-[14px] whitespace-nowrap text-text-muted">{capitalizar(NEGOCIO.envase.plural)}</dt>
            <dd className="text-[18px] font-semibold text-text tabular-nums">{unidadesMes}</dd>
          </div>
          <div className="flex min-w-[110px] flex-col">
            <dt className="text-[14px] whitespace-nowrap text-text-muted">Ticket promedio</dt>
            <dd className="text-[18px] font-semibold text-text tabular-nums">
              {formatCentavos(ticketPromedioCentavos)}
            </dd>
          </div>
          <div className="flex min-w-[120px] flex-col">
            <dt className="text-[14px] whitespace-nowrap text-text-muted">Medio más usado</dt>
            <dd className="text-[18px] font-semibold text-text">{medioMasUsado}</dd>
          </div>
        </dl>
      </Tarjeta>

      <ComprobantesList rows={listRows} />
    </div>
  );
}
