"use client";

import type { CostosLoteState, TransporteModo } from "@/lib/dominio/lotes";

import { MoneyField, PctField } from "@/components/stock/costos-lote-campos/campos";

type TransporteBlockProps = {
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
};

/** Bloque "Transporte" de "Costos del pedido" (`CostosLoteCampos`): % sobre
 * aceite + envasado + etiquetas, o monto fijo del pedido — nunca los dos. */
export function TransporteBlock({ value, onChange }: TransporteBlockProps) {
  function setTransporteModo(modo: TransporteModo) {
    onChange({ ...value, transporteModo: modo });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
        Transporte
      </span>
      <div className="grid grid-cols-2 gap-px bg-border">
        <button
          type="button"
          onClick={() => setTransporteModo("porcentaje")}
          className={`min-h-11 px-3 text-[12px] font-medium transition-colors ${
            value.transporteModo === "porcentaje"
              ? "bg-primary text-background"
              : "bg-surface-raised text-text"
          }`}
        >
          % sobre aceite, envasado y etiquetas
        </button>
        <button
          type="button"
          onClick={() => setTransporteModo("fijo")}
          className={`min-h-11 px-3 text-[12px] font-medium transition-colors ${
            value.transporteModo === "fijo"
              ? "bg-primary text-background"
              : "bg-surface-raised text-text"
          }`}
        >
          Monto fijo del pedido
        </button>
      </div>
      {value.transporteModo === "porcentaje" ? (
        <PctField
          id="transporte-pct"
          label="Transporte %"
          value={value.transportePct}
          onChange={(v) => onChange({ ...value, transportePct: v })}
          hint="Se calcula sobre el costo de aceite + envasado + etiquetas de cada botella. Si pagaste otro monto, lo corregís en el resumen al guardar."
        />
      ) : (
        <MoneyField
          id="transporte-fijo"
          label="Transporte (total del pedido)"
          value={value.transporteFijo}
          onChange={(v) => onChange({ ...value, transporteFijo: v })}
          hint="Lo que pagaste de flete por todo el pedido. Se reparte entre las botellas."
        />
      )}
    </div>
  );
}

type OtrosBlockProps = {
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
};

/** Bloque "Otros" de "Costos del pedido" (`CostosLoteCampos`): un monto
 * total libre (con descripción) repartido entre las botellas del pedido. */
export function OtrosBlock({ value, onChange }: OtrosBlockProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="sm:w-[40%]">
        <MoneyField
          id="otros"
          label="Otros (total)"
          value={value.otros}
          onChange={(v) => onChange({ ...value, otros: v })}
          hint="Cualquier otro gasto del pedido. Se reparte entre las botellas."
        />
      </div>
      <div className="flex-1">
        <label
          htmlFor="otros-descripcion"
          className="block text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Descripción
        </label>
        <input
          id="otros-descripcion"
          type="text"
          value={value.otrosDescripcion}
          onChange={(event) => onChange({ ...value, otrosDescripcion: event.target.value })}
          placeholder="Ej. cajas"
          className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
        />
        <p className="mt-1 text-[11px] leading-snug text-text-muted">
          Para acordarte qué fue ese gasto.
        </p>
      </div>
    </div>
  );
}
