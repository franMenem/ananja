"use client";

import { useMemo } from "react";

import { calcularCostoAceite, litrosAceitePorItem } from "@/lib/dominio/costos-lote";
import { formatFecha } from "@/lib/fechas";
import { formatNumeroInsumo } from "@/lib/dominio/insumos";
import { formatCentavos, formatMonto } from "@/lib/money";
import { formatPresentacion, NEGOCIO } from "@/lib/negocio";
import type { CostosLoteState } from "@/lib/dominio/lotes";

import { MoneyField } from "@/components/stock/costos-lote-campos/campos";
import {
  parseCampo,
  type AceiteHeredado,
  type ProductoLoteItem,
  type TanqueAceiteHint,
} from "@/components/stock/costos-lote-campos/tipos";

type AceiteBlockProps = {
  /** Solo las presentaciones que se están produciendo/editando ahora
   * (cantidad > 0) — para la línea de cuenta por presentación. */
  items: ProductoLoteItem[];
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
  tanqueAceite?: TanqueAceiteHint;
  aceiteHeredado?: AceiteHeredado;
};

/**
 * Bloque "{NEGOCIO.materiaPrima.nombre} (se carga en dólares)" de "Costos
 * del pedido" (`CostosLoteCampos`): dólar + precio del litro en USD (con
 * precedencia ARS explícito > USD × dólar > tanque, `calcularCostoAceite`),
 * el aviso de heredado (`AceiteHeredado`) y la cuenta por presentación.
 */
export function AceiteBlock({
  items,
  value,
  onChange,
  tanqueAceite = null,
  aceiteHeredado = null,
}: AceiteBlockProps) {
  function set<K extends keyof CostosLoteState>(key: K, val: CostosLoteState[K]) {
    onChange({ ...value, [key]: val });
  }

  // Aceite (0030): resuelve el precio por litro con la misma precedencia
  // que `aplicar_costos_lote` — ARS explícito (override puntual) > USD ×
  // dólar (cuando LOS DOS están cargados) > `null` (el promedio del tanque,
  // si existe, es responsabilidad del caller — acá se combina recién en
  // `precioLitroResuelto`, más abajo). `calcularCostoAceite` con `litros: 1`
  // da directamente el precio por litro en ARS de cualquiera de las dos
  // ramas, sin reimplementar la fórmula acá.
  const aceite = useMemo(() => {
    const dolarCentavos = parseCampo(value.dolar);
    const usdCentavos = parseCampo(value.precioLitroAceiteUsd);
    const arsCentavos = parseCampo(value.precioLitroAceite);
    const precioLitroResuelto = calcularCostoAceite({
      litros: 1,
      usdPorLitroCentavos: usdCentavos,
      dolarCentavos,
      arsPorLitroCentavos: arsCentavos,
    });
    return { dolarCentavos, usdCentavos, arsCentavos, precioLitroResuelto };
  }, [value.dolar, value.precioLitroAceiteUsd, value.precioLitroAceite]);

  // `true` mientras el campo siga IGUAL al del pedido de referencia — deja
  // de avisar en cuanto el dueño lo toca (edita a otro valor, o lo borra).
  // Comparación numérica (no de string) para no depender del formato exacto
  // del input. Riesgo real reportado en la revisión de 0030: `crear_lote`
  // hereda dólar/USD del lote más reciente EN SILENCIO si no se los manda —
  // un pedido creado un mes después terminó costeando el aceite con un
  // dólar de $1.000 vencido, sin ningún aviso.
  const dolarEsHeredado =
    aceiteHeredado?.dolarCentavos != null && aceite.dolarCentavos === aceiteHeredado.dolarCentavos;
  const usdEsHeredado =
    aceiteHeredado?.usdCentavos != null && aceite.usdCentavos === aceiteHeredado.usdCentavos;

  // Una línea de cuenta por presentación DISTINTA usada en el pedido (0,25 L
  // × USD 5,00 × $ 1.000,00 = $ 1.250,00) — o con el override ARS cuando
  // está cargado (0,25 L × $ 5.000,00/L = $ 1.250,00). Ninguna línea si
  // `aceite.precioLitroResuelto` es `null` (nada cargado todavía). Cuando la
  // cuenta corre enteramente con dólar/USD heredados (sin editar), se anota
  // la fuente para que no pase desapercibido en la vista previa.
  const aceiteLineas = useMemo(() => {
    if (aceite.precioLitroResuelto === null) return [];
    const notaHeredado =
      aceite.arsCentavos === null && dolarEsHeredado && usdEsHeredado
        ? " (con el dólar del pedido anterior)"
        : "";
    const vistas = new Set<number>();
    const lineas: { presentacionMl: number; texto: string }[] = [];
    for (const item of items) {
      if (vistas.has(item.presentacionMl)) continue;
      vistas.add(item.presentacionMl);
      const litros = litrosAceitePorItem({ presentacionMl: item.presentacionMl, cantidad: 1 });
      const costoCentavos = calcularCostoAceite({
        litros,
        usdPorLitroCentavos: aceite.usdCentavos,
        dolarCentavos: aceite.dolarCentavos,
        arsPorLitroCentavos: aceite.arsCentavos,
      });
      if (costoCentavos === null) continue;
      const litrosTexto = `${formatNumeroInsumo(litros)} L`;
      const cuenta =
        aceite.arsCentavos !== null
          ? `${litrosTexto} × ${formatCentavos(aceite.arsCentavos)}/L`
          : `${litrosTexto} × ${formatMonto("USD", aceite.usdCentavos ?? 0)} × ${formatCentavos(aceite.dolarCentavos ?? 0)}`;
      lineas.push({
        presentacionMl: item.presentacionMl,
        texto: `${formatPresentacion(item.presentacionMl)}: ${cuenta} = ${formatCentavos(costoCentavos)}${notaHeredado}`,
      });
    }
    return lineas;
  }, [items, aceite, dolarEsHeredado, usdEsHeredado]);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
        {NEGOCIO.materiaPrima.nombre} (se carga en dólares)
      </span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <MoneyField
            id="dolar"
            label="Precio del dólar"
            value={value.dolar}
            onChange={(v) => set("dolar", v)}
            hint="Cotización del día del pedido."
          />
        </div>
        <div className="flex-1">
          <MoneyField
            id="precio-litro-aceite-usd"
            label={`Precio del litro (USD)`}
            value={value.precioLitroAceiteUsd}
            onChange={(v) => set("precioLitroAceiteUsd", v)}
            symbol="USD"
            hint={`Lo que costó cada litro de ${NEGOCIO.materiaPrima.nombre.toLowerCase()} a granel.`}
          />
        </div>
      </div>

      {(dolarEsHeredado || usdEsHeredado) && aceiteHeredado && (
        <div className="flex flex-col gap-1 border-l-2 border-accent bg-surface-raised p-3">
          {dolarEsHeredado && (
            <p className="text-[11px] leading-[1.5] text-accent">
              Dólar {formatCentavos(aceiteHeredado.dolarCentavos!)} — del pedido del{" "}
              {formatFecha(aceiteHeredado.fecha)}. ¿Lo actualizás?
            </p>
          )}
          {usdEsHeredado && (
            <p className="text-[11px] leading-[1.5] text-accent">
              Precio del litro {formatMonto("USD", aceiteHeredado.usdCentavos!)} — del pedido
              del {formatFecha(aceiteHeredado.fecha)}. ¿Sigue vigente?
            </p>
          )}
        </div>
      )}

      {aceiteLineas.length > 0 && (
        <div className="flex flex-col gap-1">
          {aceiteLineas.map((linea) => (
            <p
              key={linea.presentacionMl}
              className="text-[12px] leading-snug tabular-nums text-text-muted"
            >
              {linea.texto}
            </p>
          ))}
        </div>
      )}

      {aceite.precioLitroResuelto === null &&
        (tanqueAceite && tanqueAceite.costoPromedioCentavosPorLitro != null ? (
          <p className="text-[11px] leading-[1.5] text-text-muted">
            Sin dólar ni precio del litro cargados, el costo va a salir del
            promedio de lo que compraste (quedan{" "}
            {tanqueAceite.litrosRestantes.toLocaleString("es-AR", {
              maximumFractionDigits: 2,
            })}{" "}
            L en {NEGOCIO.materiaPrima.nombre.toLowerCase()}).
          </p>
        ) : (
          <p className="text-[11px] leading-[1.5] text-text-muted">
            Sin dólar, precio del litro ni precio en pesos cargados, el
            pedido se va a guardar sin costo de{" "}
            {NEGOCIO.materiaPrima.nombre.toLowerCase()}.
          </p>
        ))}

      <div className="mt-1">
        <MoneyField
          id="precio-litro-aceite"
          label={`o poné el precio del litro de ${NEGOCIO.materiaPrima.nombre} en pesos`}
          value={value.precioLitroAceite}
          onChange={(v) => set("precioLitroAceite", v)}
          small
        />
        <p className="mt-1 text-[11px] leading-snug text-text-muted">
          Excepción puntual de este pedido — gana sobre el dólar y el
          precio en USD de arriba, pero no se guarda para el próximo
          pedido.
        </p>
      </div>
    </div>
  );
}
