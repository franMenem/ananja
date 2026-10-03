"use client";

import { NEGOCIO } from "@/lib/negocio";
import type { CostosLoteState } from "@/lib/dominio/lotes";

import { useProveedor } from "@/components/stock/proveedor-context";
import { PctField } from "@/components/stock/costos-lote-campos/campos";

type IvaBlockProps = {
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
};

/** Bloque "IVA" de "Costos del pedido" (`CostosLoteCampos`): el % que cada
 * switch "sin IVA" de envase/etiqueta le suma al costo de la botella —
 * Ananja es monotributo, no lo recupera. */
export function IvaBlock({ value, onChange }: IvaBlockProps) {
  const proveedor = useProveedor();

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        IVA
      </span>
      <p className="text-[11px] leading-[1.5] text-text-muted">
        El tilde &quot;sin IVA&quot; de cada envase/etiqueta está junto a su
        campo, más arriba — le suma el 21% al costo de la botella (nunca a
        lo que le pagás {proveedor.a}, ver la cabecera de cada sección).
      </p>
      <PctField
        id="iva-pct"
        label="IVA %"
        value={value.ivaPct}
        onChange={(v) => onChange({ ...value, ivaPct: v })}
        hint="Normalmente 21."
      />
      <p className="text-[11px] leading-[1.5] text-text-muted">
        Ananja es monotributo: ese IVA no se recupera, así que es parte del
        costo del envasado y las etiquetas (nunca del {NEGOCIO.materiaPrima.nombre}).
      </p>
    </div>
  );
}

type PreciosBlockProps = {
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
};

/** Bloque "Precios" de "Costos del pedido" (`CostosLoteCampos`): los % de
 * ganancia/mayorista/minorista encadenados sobre el costo de producción. */
export function PreciosBlock({ value, onChange }: PreciosBlockProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        Precios
      </span>
      <PctField
        id="ganancia-pct"
        label="Ganancia Ananja %"
        value={value.gananciaPct}
        onChange={(v) => onChange({ ...value, gananciaPct: v })}
        hint="Se suma al costo de producción. El resultado (costo Ananja) es lo que cada vendedor le debe a Ananja por botella."
      />
      <PctField
        id="mayorista-pct"
        label="Mayorista sugerido % sobre el costo Ananja"
        value={value.mayoristaPct}
        onChange={(v) => onChange({ ...value, mayoristaPct: v })}
        hint="Precio sugerido para vender por mayor."
      />
      <PctField
        id="minorista-pct"
        label="Minorista sugerido % sobre el mayorista"
        value={value.minoristaPct}
        onChange={(v) => onChange({ ...value, minoristaPct: v })}
        hint="Precio sugerido para vender al público."
      />
    </div>
  );
}
