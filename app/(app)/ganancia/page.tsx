"use client";

import { useMemo, useState } from "react";

import { AvisoCarga } from "@/components/ui/aviso-carga";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { useCarga } from "@/components/ui/use-carga";
import { BotellasVendidas } from "@/components/ganancia/botellas-vendidas";
import { GananciaHeader, type Periodo } from "@/components/ganancia/ganancia-header";
import { GananciaVendedores } from "@/components/ganancia/ganancia-vendedores";
import { TablaPorMes } from "@/components/ganancia/tabla-por-mes";
import { VentasPorMes } from "@/components/ganancia/ventas-por-mes";
import {
  cargarDatosGraficos,
  listarCoordinadorIds,
  listarGastosConCategoria,
  listarMargenVentas,
  listarVendedoresNombre,
  type DatosGraficos,
} from "@/lib/data/ganancia";
import {
  agruparMargenVendedorPorPeriodo,
  calcularGananciaAnanjaPorPeriodo,
  desgloseResultadoDelPeriodo,
  filtrarGastosOperativos,
  mapearFilasMargenVentas,
  margenVendedoresDePeriodo,
  unidadesSinPrecioRevendedorDePeriodo,
  type FilaMargenPeriodo,
  type GastoOperativo,
} from "@/lib/dominio/margen";
import { createClient } from "@/lib/supabase/client";

/**
 * `/ganancia` (`/ganancia/graficos` se fundió acá, redirect en
 * `next.config.ts`). Chips Este mes/Este año (default "Este año") gobiernan
 * el bloque oliva y "Botellas vendidas"; el gráfico y "Por mes" no. Esta
 * página solo trae los datos y compone — la presentación vive en
 * `components/ganancia/*` y la agregación pura en `lib/margen.ts`/
 * `lib/graficos.ts` (donde `null` en `margen_ananja_centavos`/
 * `margen_vendedor_centavos` es "sin costo cargado", nunca 0 — ver
 * `resumirMargenAnanja`).
 */

const DATOS_GRAFICOS_VACIOS: DatosGraficos = {
  comprobantes: [],
  ventasRevendedor: [],
  comprobanteItems: [],
  productos: [],
};

type Vendedor = { id: string; nombre: string };

type DatosGanancia = {
  margenRows: FilaMargenPeriodo[];
  gastosOperativos: GastoOperativo[];
  vendedores: Vendedor[];
  coordinadorIds: ReadonlySet<string>;
  datosGraficos: DatosGraficos;
};

const DATOS_GANANCIA_VACIOS: DatosGanancia = {
  margenRows: [],
  gastosOperativos: [],
  vendedores: [],
  coordinadorIds: new Set(),
  datosGraficos: DATOS_GRAFICOS_VACIOS,
};

function mesActualISO(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

export default function GananciaPage() {
  const [periodo, setPeriodo] = useState<Periodo>("anio");

  // Todo lo que trae la pantalla, en un solo estado: un fallo no se ve como
  // "todavía no hay ventas ni gastos" (ver `useCarga`).
  const { estado: carga, reintentar } = useCarga<DatosGanancia>(async () => {
    const supabase = createClient();
    const [margenRes, gastosRes, vendedoresRes, graficosRes, idsCoordinadoras] = await Promise.all([
      listarMargenVentas(supabase),
      listarGastosConCategoria(supabase),
      listarVendedoresNombre(supabase),
      cargarDatosGraficos(supabase),
      listarCoordinadorIds(supabase),
    ]);

    if (graficosRes.error) console.error("ganancia: gráfico de líneas", graficosRes.error);

    return {
      data: {
        margenRows: mapearFilasMargenVentas(margenRes.data),
        gastosOperativos: filtrarGastosOperativos(gastosRes.data),
        vendedores: vendedoresRes.data,
        coordinadorIds: new Set(idsCoordinadoras),
        // El gráfico es accesorio: si falla solo él, el resto se muestra.
        datosGraficos: graficosRes.error ? DATOS_GRAFICOS_VACIOS : graficosRes.data,
      },
      error: margenRes.error || gastosRes.error || vendedoresRes.error ? "No se pudo cargar la información de ganancia." : null,
    };
  });
  const loading = carga.tipo === "cargando";
  const error = carga.tipo === "error" ? carga.mensaje : null;
  const { margenRows, gastosOperativos, vendedores, coordinadorIds, datosGraficos } =
    carga.tipo === "listo" ? carga.datos : DATOS_GANANCIA_VACIOS;

  const filasAnanjaPorMes = useMemo(
    () => calcularGananciaAnanjaPorPeriodo(margenRows, gastosOperativos, "mes"),
    [margenRows, gastosOperativos],
  );
  const filasAnanjaPorAnio = useMemo(
    () => calcularGananciaAnanjaPorPeriodo(margenRows, gastosOperativos, "anio"),
    [margenRows, gastosOperativos],
  );
  const vendedorPorMes = useMemo(() => agruparMargenVendedorPorPeriodo(margenRows, "mes"), [margenRows]);
  const vendedorPorAnio = useMemo(() => agruparMargenVendedorPorPeriodo(margenRows, "anio"), [margenRows]);

  const anioActual = String(new Date().getFullYear());
  const mesActual = mesActualISO();
  const periodoActual = periodo === "mes" ? mesActual : anioActual;

  // Parte de la misma función que usa la pantalla Hoy para "Este mes
  // ganaste…" (`gananciaAnanjaDelPeriodo`), abierta en filas.
  const desglose = desgloseResultadoDelPeriodo(margenRows, gastosOperativos, periodo, periodoActual);

  // Las coordinadoras no van en esta tabla (venden a precio = costo, 0073).
  const vendedoresEsteMes = margenVendedoresDePeriodo(vendedorPorMes, mesActual, coordinadorIds);
  const vendedoresEsteAnio = margenVendedoresDePeriodo(vendedorPorAnio, anioActual, coordinadorIds);
  const nombreDe = (vendedorId: string) => vendedores.find((v) => v.id === vendedorId)?.nombre ?? "Vendedor";

  const vacio = filasAnanjaPorMes.length === 0 && filasAnanjaPorAnio.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-8">
      <EncabezadoPantalla titulo="Ganancia" pregunta="¿Cuánto ganamos?" />

      <GananciaHeader
        periodo={periodo}
        onChangePeriodo={setPeriodo}
        desglose={!loading && !error && !vacio ? desglose : null}
      />

      {error && <AvisoCarga variante="pagina" mensaje={error} onReintentar={reintentar} />}

      {loading ? (
        <p className="py-6 text-[16px] text-text-muted">Cargando…</p>
      ) : !error && vacio ? (
        <p className="py-6 text-[16px] text-text-muted">Todavía no hay ventas ni gastos.</p>
      ) : !error ? (
        <>
          <VentasPorMes datosGraficos={datosGraficos} />

          <TablaPorMes filas={filasAnanjaPorMes.slice(0, 12)} />

          <GananciaVendedores
            mesActual={mesActual}
            anioActual={anioActual}
            vendedoresEsteMes={vendedoresEsteMes}
            vendedoresEsteAnio={vendedoresEsteAnio}
            nombreDe={nombreDe}
            unidadesSinPrecioMes={unidadesSinPrecioRevendedorDePeriodo(margenRows, "mes", mesActual)}
            unidadesSinPrecioAnio={unidadesSinPrecioRevendedorDePeriodo(margenRows, "anio", anioActual)}
          />

          <BotellasVendidas datosGraficos={datosGraficos} periodo={periodo} />
        </>
      ) : null}
    </div>
  );
}
