"use client";

import { useMemo, useState } from "react";

import { AvisoCarga } from "@/components/ui/aviso-carga";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { useCarga } from "@/components/ui/use-carga";
import { BotellasVendidas } from "@/components/ganancia/botellas-vendidas";
import {
  EsqueletoBotellasVendidas,
  EsqueletoGananciaVendedores,
  EsqueletoTablaPorMes,
  EsqueletoVentasPorMes,
} from "@/components/ganancia/esqueletos";
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

type Vendedor = { id: string; nombre: string };

type DatosGanancia = {
  margenRows: FilaMargenPeriodo[];
  gastosOperativos: GastoOperativo[];
  vendedores: Vendedor[];
  coordinadorIds: ReadonlySet<string>;
};

const DATOS_GANANCIA_VACIOS: DatosGanancia = {
  margenRows: [],
  gastosOperativos: [],
  vendedores: [],
  coordinadorIds: new Set(),
};

function mesActualISO(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

export default function GananciaPage() {
  const [periodo, setPeriodo] = useState<Periodo>("anio");

  // Dos cargas independientes (cada una con su estado, su reintento y su
  // descarte de respuestas viejas): la de la cuenta depende de la lectura lenta
  // `v_margen_ventas`; la de los gráficos no, así que no la espera. Un fallo
  // no se ve como "todavía no hay ventas" (ver `useCarga`).
  const { estado: carga, reintentar } = useCarga<DatosGanancia>(async () => {
    const supabase = createClient();
    const [margenRes, gastosRes, vendedoresRes, idsCoordinadoras] = await Promise.all([
      listarMargenVentas(supabase),
      listarGastosConCategoria(supabase),
      listarVendedoresNombre(supabase),
      listarCoordinadorIds(supabase),
    ]);

    return {
      data: {
        margenRows: mapearFilasMargenVentas(margenRes.data),
        gastosOperativos: filtrarGastosOperativos(gastosRes.data),
        vendedores: vendedoresRes.data,
        coordinadorIds: new Set(idsCoordinadoras),
      },
      error: margenRes.error || gastosRes.error || vendedoresRes.error ? "No se pudo cargar la información de ganancia." : null,
    };
  });
  const { estado: cargaGraficos, reintentar: reintentarGraficos } = useCarga<DatosGraficos>(async () => {
    const res = await cargarDatosGraficos(createClient());
    if (res.error) console.error("ganancia: gráficos", res.error);
    return res;
  });
  const loading = carga.tipo === "cargando";
  const error = carga.tipo === "error" ? carga.mensaje : null;
  const { margenRows, gastosOperativos, vendedores, coordinadorIds } =
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

  // Solo se afirma "no hay datos" cuando la carga lenta TERMINÓ bien.
  const vacio = carga.tipo === "listo" && filasAnanjaPorMes.length === 0 && filasAnanjaPorAnio.length === 0;
  const mostrarCuenta = carga.tipo === "listo" && !vacio;

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-8">
      <EncabezadoPantalla titulo="Ganancia" pregunta="¿Cuánto ganamos?" />

      <GananciaHeader
        periodo={periodo}
        onChangePeriodo={setPeriodo}
        desglose={mostrarCuenta ? desglose : null}
        cargando={loading}
      />

      {error && <AvisoCarga variante="pagina" mensaje={error} onReintentar={reintentar} />}
      {vacio && <p className="py-6 text-[16px] text-text-muted">Todavía no hay ventas ni gastos.</p>}

      {/* Los gráficos no dependen de la vista lenta: aparecen cuando llegan los
          suyos, vengan antes o después de la cuenta. */}
      {cargaGraficos.tipo === "cargando" ? (
        <EsqueletoVentasPorMes />
      ) : cargaGraficos.tipo === "error" ? (
        <AvisoCarga mensaje="No se pudieron cargar los gráficos de ventas." onReintentar={reintentarGraficos} />
      ) : (
        <VentasPorMes datosGraficos={cargaGraficos.datos} />
      )}

      {loading ? (
        <>
          <EsqueletoTablaPorMes />
          <EsqueletoGananciaVendedores />
        </>
      ) : mostrarCuenta ? (
        <>
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
        </>
      ) : null}

      {cargaGraficos.tipo === "cargando" ? (
        <EsqueletoBotellasVendidas />
      ) : cargaGraficos.tipo === "listo" ? (
        <BotellasVendidas datosGraficos={cargaGraficos.datos} periodo={periodo} />
      ) : null}
    </div>
  );
}
