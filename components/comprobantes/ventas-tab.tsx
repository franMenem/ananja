import Link from "next/link";

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

// Cifra heroica de la cabecera móvil (design/handoff README § Tipografía — la cifra grande
// no lleva decimales, a diferencia de los montos tabulares del resto de la
// app). Es solo presentación: el monto exacto sigue viviendo en centavos.
function formatSinDecimales(centavos: number): string {
  const pesos = Math.trunc(centavos / 100);
  return `$ ${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Pestaña "Ventas" de `/comprobantes`: cobrado del mes, franja de métricas y
 * la lista de comprobantes de venta. Es lo que mostraba la página entera
 * antes de las pestañas.
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
  const nombreMesCapitalizado =
    nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Cabecera de sección: cobrado en el mes + accesos */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2 md:hidden">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Cobrado en {nombreMesCapitalizado.toLowerCase()}
            </span>
            <Link
              href="/clientes"
              className="text-[11px] tracking-[0.1em] text-text-muted uppercase hover:text-primary-hover"
            >
              Clientes
            </Link>
          </div>
          <span className="font-display text-[32px] leading-none text-primary tabular-nums md:hidden">
            {formatSinDecimales(totalMesCentavos)}
          </span>
          <span className="text-[11px] text-text-muted md:hidden">
            {cantidadMes} registros
          </span>

          <div className="hidden flex-col gap-0.5 md:flex">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              {cantidadMes} registros
            </span>
            <h1 className="font-display text-[38px] leading-[1.05] text-primary">
              Comprobantes
            </h1>
          </div>
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          <Link
            href="/clientes"
            className="flex min-h-11 items-center border border-border px-4 text-[11px] tracking-[0.1em] text-text-muted uppercase"
          >
            Clientes
          </Link>
          <Link
            href="/comprobantes/nuevo"
            className="flex min-h-11 items-center gap-2 bg-primary px-5 text-[12px] font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
          >
            + Cargar
          </Link>
        </div>
      </div>

      {/* Franja oliva de métricas — solo escritorio. `flex-wrap` + gaps
          más chicos en `md` (768–1023px: poco margen al lado del rail de
          238px) evitan que los rótulos largos ("Medio más usado") se
          partan en 2–3 líneas; desde `lg` (1024px) vuelve al espaciado
          del artboard. */}
      <div className="hidden flex-wrap items-end gap-x-6 gap-y-3 bg-primary px-[26px] py-[18px] md:flex lg:gap-x-10">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] tracking-[0.22em] whitespace-nowrap text-on-primary-muted uppercase">
            Cobrado en el mes
          </span>
          <span className="font-display text-[32px] leading-none text-background tabular-nums lg:text-[40px]">
            {formatCentavos(totalMesCentavos)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-3 border-l border-primary-line pl-6 lg:gap-x-8 lg:pl-[34px]">
          <div className="flex min-w-[70px] flex-col gap-0.5">
            <span className="text-[11px] tracking-[0.14em] whitespace-nowrap text-on-primary-muted uppercase">
              {capitalizar(NEGOCIO.envase.plural)}
            </span>
            <span className="text-lg text-background tabular-nums">
              {unidadesMes}
            </span>
          </div>
          <div className="flex min-w-[110px] flex-col gap-0.5">
            <span className="text-[11px] tracking-[0.14em] whitespace-nowrap text-on-primary-muted uppercase">
              Ticket promedio
            </span>
            <span className="text-lg text-background tabular-nums">
              {formatCentavos(ticketPromedioCentavos)}
            </span>
          </div>
          <div className="flex min-w-[120px] flex-col gap-0.5">
            <span className="text-[11px] tracking-[0.14em] whitespace-nowrap text-on-primary-muted uppercase">
              Medio más usado
            </span>
            <span className="text-lg text-background">{medioMasUsado}</span>
          </div>
        </div>
      </div>

      <ComprobantesList rows={listRows} />
    </div>
  );
}
