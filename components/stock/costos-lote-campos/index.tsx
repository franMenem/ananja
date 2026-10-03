"use client";

import { useMemo } from "react";

import { calcularPedido, type RecetaEtiquetaConInsumo } from "@/lib/dominio/costos-lote";
import { NEGOCIO } from "@/lib/negocio";
import { construirEntradaPedido, parsePctInput, type CostosLoteState } from "@/lib/dominio/lotes";

import { AceiteBlock } from "@/components/stock/costos-lote-campos/aceite";
import { EtiquetasBlock } from "@/components/stock/costos-lote-campos/etiquetas";
import { EnvasesBlock } from "@/components/stock/costos-lote-campos/envases";
import { TransporteBlock, OtrosBlock } from "@/components/stock/costos-lote-campos/transporte";
import { IvaBlock, PreciosBlock } from "@/components/stock/costos-lote-campos/iva-precios";
import { ResumenBlock } from "@/components/stock/costos-lote-campos/resumen";
import type {
  AceiteHeredado,
  EtiquetaInsumoLote,
  ProductoLoteItem,
  TanqueAceiteHint,
  UltimasComprasEtiquetas,
} from "@/components/stock/costos-lote-campos/tipos";

export type {
  AceiteHeredado,
  EtiquetaInsumoLote,
  ProductoLoteItem,
  TanqueAceiteHint,
  UltimasComprasEtiquetas,
} from "@/components/stock/costos-lote-campos/tipos";

type CostosLoteCamposProps = {
  /** Solo las presentaciones que se están produciendo/editando ahora
   * (cantidad > 0) — un envase se pide por cada una de estas. */
  items: ProductoLoteItem[];
  /** Recetas (producto, insumo de etiqueta, cantidad por botella) de TODAS
   * las etiquetas que usan `items` — una fila por (producto, insumo). */
  recetasEtiqueta: RecetaEtiquetaConInsumo[];
  /** Insumos de etiqueta distintos usados por `items` — un campo de precio
   * por TAMAÑO (frente + reverso agrupados, `agruparEtiquetasPorLado`), sin
   * envío por separado. */
  etiquetas: EtiquetaInsumoLote[];
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
  tanqueAceite?: TanqueAceiteHint;
  /** `true`: `value.etiquetasPorInsumo` incluye precios reconstruidos de
   * `lote_costos` con el formato anterior a 0029 (`prefillCostosLote`) —
   * muestra un aviso arriba de "Etiquetas" para que se revisen antes de
   * guardar. */
  avisoEtiquetaLegado?: boolean;
  /** Dólar/USD del pedido de referencia (el anterior a este) — mientras
   * `value.dolar`/`value.precioLitroAceiteUsd` sigan siendo IGUALES a estos
   * valores, se muestra un aviso para que se revisen antes de guardar (ver
   * `AceiteHeredado`). */
  aceiteHeredado?: AceiteHeredado;
  /** Última compra de cada insumo de etiqueta — para el hint "Precio de la
   * última compra — 12/09" bajo el precio que `prefillCostosLote` haya
   * prefijado desde ahí (ver `UltimasComprasEtiquetas`). */
  ultimasComprasEtiquetas?: UltimasComprasEtiquetas;
  /** `true`: "Actualizar costos del depósito" (`ActualizarCostoLoteForm`,
   * 0052) — acá no hay pago al proveedor (el pedido ya se pagó, esto es solo una
   * revaloración del costo de reposición), así que SOLO tiene sentido un
   * precio por renglón: se oculta la columna "precio para el costo"
   * (0053_pago_vs_costo_insumo.sql) y el campo de siempre
   * (`envasePorProducto`/`etiquetasPorInsumo[].precioUnitario`) se relabelea
   * como el precio para costo — es, ni más ni menos, lo que esta pantalla
   * ya manda como `precio_unitario_centavos` (el RPC de acá,
   * `actualizar_costo_lote_vigente`, nunca usa `a_pagar_centavos`). Default
   * `false` (formulario del pedido, con las dos columnas). */
  soloCosto?: boolean;
};

/**
 * Sección "Costos del pedido" — compartida por `LoteForm` (alta, dentro de
 * `crear_lote` vía `p_costos`) y `CostosLoteForm` (completar/editar un
 * lote existente vía `fijar_costos_lote`). Todos los campos son opcionales
 * (`supabase/migrations/0029_costos_reales_lote.sql` § `aplicar_costos_lote`):
 * precio por litro de aceite (prefijado desde `v_tanque_aceite`, ver
 * `tanqueAceite`), un precio por tamaño de etiqueta (frente + reverso
 * agrupados, `agruparEtiquetasPorLado` — lib/insumos.ts — sin envío por
 * separado), precio de envase por presentación (con la cuenta explícita
 * junto al campo, `cuentaEnvaseCampo`), transporte (% sobre aceite +
 * envasado + etiquetas o monto fijo — nunca los dos) y otros. IVA: Ananja es
 * monotributo, el IVA de envase/etiqueta no es recuperable y se suma como
 * parte del costo — nunca al aceite; cada switch de IVA vive junto a sus
 * propios campos (etiquetas) o en la sección de abajo (envasado). La vista
 * previa usa `calcularPedido` (lib/costos-lote.ts) para no duplicar la
 * aritmética de `aplicar_costos_lote`/`v_costo_lote_desglose`.
 *
 * Composición por bloque (un archivo por concepto en este directorio, cada
 * uno con su propia sección de estado/JSX): `aceite.tsx`, `etiquetas.tsx`,
 * `envases.tsx`, `transporte.tsx` (transporte + otros), `iva-precios.tsx`
 * (IVA + Precios) y `resumen.tsx` (vista previa "Costo por botella"). Este
 * componente sigue siendo la fachada pública — misma API que antes de la
 * partición — y solo calcula lo que varios bloques comparten (`calculo`,
 * `ivaPctNum`) para no duplicar esa aritmética.
 */
export function CostosLoteCampos({
  items,
  recetasEtiqueta,
  etiquetas,
  value,
  onChange,
  tanqueAceite = null,
  avisoEtiquetaLegado = false,
  aceiteHeredado = null,
  ultimasComprasEtiquetas = null,
  soloCosto = false,
}: CostosLoteCamposProps) {
  // Vista previa en vivo: la misma entrada y el mismo cálculo que el paso
  // "Revisá el pedido" (`construirEntradaPedido` + `calcularPedido`), sin
  // redondeos todavía. Se comparte entre los bloques de Etiquetas, Envases
  // y el resumen "Costo por botella" para no duplicar la aritmética.
  const calculo = useMemo(() => {
    if (items.length === 0) return null;
    return calcularPedido(
      construirEntradaPedido({
        state: value,
        items,
        recetasEtiqueta,
        etiquetaInsumoIds: etiquetas.map((e) => e.insumoId),
        precioLitroTanqueCentavos: tanqueAceite?.costoPromedioCentavosPorLitro ?? null,
      }),
    );
  }, [items, recetasEtiqueta, etiquetas, value, tanqueAceite]);
  const preview = calculo?.presentaciones ?? [];

  const ivaPctNum = parsePctInput(value.ivaPct) ?? 0;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5">
      <div>
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Costos del pedido (opcional)
        </span>
        <p className="pt-1.5 text-[11px] leading-[1.5] text-text-muted">
          Se puede guardar el pedido sin costos y completarlos después. Litros
          de {NEGOCIO.materiaPrima.nombre} y etiquetas se calculan solos a
          partir de la cantidad — solo hace falta el precio.
        </p>
      </div>

      <AceiteBlock
        items={items}
        value={value}
        onChange={onChange}
        tanqueAceite={tanqueAceite}
        aceiteHeredado={aceiteHeredado}
      />

      <EtiquetasBlock
        items={items}
        recetasEtiqueta={recetasEtiqueta}
        etiquetas={etiquetas}
        value={value}
        onChange={onChange}
        ivaPctNum={ivaPctNum}
        calculo={calculo}
        avisoEtiquetaLegado={avisoEtiquetaLegado}
        ultimasComprasEtiquetas={ultimasComprasEtiquetas}
        soloCosto={soloCosto}
      />

      <EnvasesBlock
        items={items}
        value={value}
        onChange={onChange}
        ivaPctNum={ivaPctNum}
        calculo={calculo}
        soloCosto={soloCosto}
      />

      <TransporteBlock value={value} onChange={onChange} />

      <OtrosBlock value={value} onChange={onChange} />

      <IvaBlock value={value} onChange={onChange} />

      <PreciosBlock value={value} onChange={onChange} />

      <ResumenBlock preview={preview} value={value} onChange={onChange} />
    </div>
  );
}
