"use client";

import { useMemo, useState } from "react";

import {
  cuentaEnvaseCampo,
  fusionarPrecioEtiquetaGrupo,
  repartirPrecioEtiquetaGrupo,
  type PedidoCalculado,
  type RecetaEtiquetaConInsumo,
} from "@/lib/dominio/costos-lote";
import { formatFechaSinAnio } from "@/lib/fechas";
import { agruparEtiquetasPorLado, type GrupoEtiquetas } from "@/lib/dominio/insumos";
import { formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import type { CostosLoteState } from "@/lib/dominio/lotes";

import { MoneyField } from "@/components/stock/costos-lote-campos/campos";
import {
  parseCampo,
  type EtiquetaInsumoLote,
  type ProductoLoteItem,
  type UltimasComprasEtiquetas,
} from "@/components/stock/costos-lote-campos/tipos";

type EtiquetasBlockProps = {
  /** Solo las presentaciones que se están produciendo/editando ahora
   * (cantidad > 0) — usadas para contar cuántas botellas llevan cada
   * grupo de etiqueta (`cuentaEtiquetaGrupo`). */
  items: ProductoLoteItem[];
  recetasEtiqueta: RecetaEtiquetaConInsumo[];
  etiquetas: EtiquetaInsumoLote[];
  value: CostosLoteState;
  onChange: (value: CostosLoteState) => void;
  /** `parsePctInput(value.ivaPct) ?? 0` — calculado una sola vez en
   * `CostosLoteCampos` (lo comparte con el bloque de Envases). */
  ivaPctNum: number;
  /** Mismo cálculo de `calcularPedido` que usa la vista previa de "Costo
   * por botella" — se comparte para no duplicar la aritmética. */
  calculo: PedidoCalculado | null;
  avisoEtiquetaLegado?: boolean;
  ultimasComprasEtiquetas?: UltimasComprasEtiquetas;
  /** Ver `CostosLoteCamposProps.soloCosto` en `costos-lote-campos/index.tsx`. */
  soloCosto?: boolean;
};

/**
 * Bloque "Etiquetas" de "Costos del pedido" (`CostosLoteCampos`): un campo
 * unificado por TAMAÑO (frente + reverso agrupados, `agruparEtiquetasPorLado`)
 * — build "costos del pedido simple", invertido por "etiquetas suma"
 * (2026-09-15) — más, salvo `soloCosto`, un segundo campo con el precio
 * para el costo de la botella (0053).
 */
export function EtiquetasBlock({
  items,
  recetasEtiqueta,
  etiquetas,
  value,
  onChange,
  ivaPctNum,
  calculo,
  avisoEtiquetaLegado = false,
  ultimasComprasEtiquetas = null,
  soloCosto = false,
}: EtiquetasBlockProps) {
  // Etiquetas: un campo por TAMAÑO (frente + reverso agrupados,
  // `agruparEtiquetasPorLado`) en vez de uno por insumo — build "costos del
  // pedido simple", invertido por "etiquetas suma" (2026-09-15): el campo
  // ya NO es el precio de una sola etiqueta aplicado a los dos lados, es la
  // SUMA de lo que cuestan los dos lados de una botella (`fusionarPrecioEtiquetaGrupo`).
  // Un lote viejo con precios distintos por lado (frente $100 + retro $120)
  // muestra $220 — la suma de lo que ya estaba cargado — sin tocar esos
  // precios hasta que el dueño edite el campo.
  const gruposEtiqueta = useMemo(() => agruparEtiquetasPorLado(etiquetas), [etiquetas]);

  // Borrador (texto crudo, sin repartir) del campo unificado MIENTRAS se
  // escribe — clave = `grupo.clave`. Repartir en cada tecla reformatearía
  // el campo todo el tiempo (el usuario tipeando "220" vería "1,00" y
  // después "22,00" antes de terminar) — en vez de eso, mientras hay un
  // borrador para un grupo el campo muestra ese texto TAL CUAL (memoria
  // aparte del estado por insumo) y recién se reparte al perder el foco
  // (`confirmarEtiquetaGrupo`) — mismo momento en que `MontoInput` resuelve
  // sus propias cuentas.
  const [borradorEtiqueta, setBorradorEtiqueta] = useState<Record<string, string>>({});

  const camposEtiqueta = useMemo(() => {
    return gruposEtiqueta.map((grupo) => {
      if (grupo.clave in borradorEtiqueta) {
        return {
          grupo,
          valor: borradorEtiqueta[grupo.clave],
          ultimaCompra: null as { precioUnitarioCentavos: number; fecha: string } | null,
          precioEsDeUltimaCompra: false,
        };
      }

      const filas = grupo.insumoIds.map(
        (id) => value.etiquetasPorInsumo[id] ?? { precioUnitario: "", envio: "", precioCosto: "" },
      );
      const miembros = grupo.insumoIds.map((id, i) => {
        const fila = filas[i];
        const cargada = fila.precioUnitario.trim() !== "";
        const cantidad = recetasEtiqueta.find((r) => r.insumoId === id)?.cantidad ?? 1;
        return {
          precioUnitarioCentavos: cargada ? (parseCampo(fila.precioUnitario) ?? 0) : 0,
          envioUnitarioCentavos: cargada ? (parseCampo(fila.envio) ?? 0) : 0,
          // cantidad 0 saca al miembro sin cargar de la suma
          // (`fusionarPrecioEtiquetaGrupo`).
          cantidad: cargada ? cantidad : 0,
        };
      });
      const suma = fusionarPrecioEtiquetaGrupo(miembros, ivaPctNum, !value.sinIva);
      const valor = suma === null ? "" : formatMontoDisplay(suma);

      // Hint "Precio de la última compra": solo tiene sentido con un único
      // insumo en el grupo (frente + reverso casi nunca vienen de la misma
      // compra puntual).
      const ultimaCompra =
        grupo.insumoIds.length === 1 ? (ultimasComprasEtiquetas?.[grupo.insumoIds[0]] ?? null) : null;
      const precioEsDeUltimaCompra =
        ultimaCompra !== null && parseCampo(valor) === ultimaCompra.precioUnitarioCentavos;

      return { grupo, valor, ultimaCompra, precioEsDeUltimaCompra };
    });
  }, [
    gruposEtiqueta,
    value.etiquetasPorInsumo,
    value.sinIva,
    recetasEtiqueta,
    ivaPctNum,
    ultimasComprasEtiquetas,
    borradorEtiqueta,
  ]);

  function setEtiquetaGrupo(grupo: GrupoEtiquetas, monto: string) {
    setBorradorEtiqueta((prev) => ({ ...prev, [grupo.clave]: monto }));
  }

  /**
   * Al perder el foco del campo unificado: reparte el total escrito entre
   * los insumos del grupo (`repartirPrecioEtiquetaGrupo` — mitad y mitad,
   * el resto del redondeo al primer insumo del grupo) y recién ahí lo
   * guarda en `etiquetasPorInsumo`, sin envío por separado (Fran: "sacarlo"
   * — si hace falta, va sumado directo al precio de acá). Campo vacío:
   * limpia los dos insumos. Texto que no se entiende (una cuenta sin
   * terminar): se guarda TAL CUAL, repetido en todos los insumos del
   * grupo, para que `camposCostosLoteInvalidos` lo detecte y frene el
   * guardado — acá no se valida nada.
   */
  function confirmarEtiquetaGrupo(grupo: GrupoEtiquetas) {
    const monto = borradorEtiqueta[grupo.clave];
    if (monto === undefined) return;
    setBorradorEtiqueta((prev) => {
      if (!(grupo.clave in prev)) return prev;
      const resto = { ...prev };
      delete resto[grupo.clave];
      return resto;
    });

    const actualizadas = { ...value.etiquetasPorInsumo };
    const precioCostoDe = (insumoId: string) => value.etiquetasPorInsumo[insumoId]?.precioCosto ?? "";
    if (!monto.trim()) {
      for (const insumoId of grupo.insumoIds) {
        actualizadas[insumoId] = { precioUnitario: "", envio: "", precioCosto: precioCostoDe(insumoId) };
      }
    } else {
      const total = parseMontoInput(monto);
      if (total === null) {
        for (const insumoId of grupo.insumoIds) {
          actualizadas[insumoId] = { precioUnitario: monto, envio: "", precioCosto: precioCostoDe(insumoId) };
        }
      } else {
        const partes = repartirPrecioEtiquetaGrupo(total, grupo.insumoIds.length);
        grupo.insumoIds.forEach((insumoId, i) => {
          actualizadas[insumoId] = {
            precioUnitario: formatMontoDisplay(partes[i]),
            envio: "",
            precioCosto: precioCostoDe(insumoId),
          };
        });
      }
    }
    onChange({ ...value, etiquetasPorInsumo: actualizadas });
  }

  // "Precio para el costo de la botella" (0053) — mismo patrón de borrador +
  // reparto mitad y mitad que el campo de pago de arriba (`borradorEtiqueta`/
  // `confirmarEtiquetaGrupo`), pero SIN gross-up de IVA al sumar los lados
  // (la suma que se muestra acá es el número tal cual se escribió — el "+
  // IVA%" lo agrega la nota de la vista previa/"Revisá el pedido", no este
  // campo): `fusionarPrecioEtiquetaGrupo` con `incluyeIva: true` fuerza esa
  // suma simple. "" en el campo = "usa el mismo que se pagó/ya se compró".
  const [borradorEtiquetaCosto, setBorradorEtiquetaCosto] = useState<Record<string, string>>({});

  const camposEtiquetaCosto = useMemo(() => {
    return gruposEtiqueta.map((grupo) => {
      if (grupo.clave in borradorEtiquetaCosto) {
        return { grupo, valor: borradorEtiquetaCosto[grupo.clave] };
      }
      const miembros = grupo.insumoIds.map((id) => {
        const fila = value.etiquetasPorInsumo[id];
        const cargada = (fila?.precioCosto ?? "").trim() !== "";
        return {
          precioUnitarioCentavos: cargada ? (parseCampo(fila!.precioCosto) ?? 0) : 0,
          envioUnitarioCentavos: 0,
          cantidad: cargada ? 1 : 0,
        };
      });
      const suma = fusionarPrecioEtiquetaGrupo(miembros, ivaPctNum, true);
      return { grupo, valor: suma === null ? "" : formatMontoDisplay(suma) };
    });
  }, [gruposEtiqueta, value.etiquetasPorInsumo, ivaPctNum, borradorEtiquetaCosto]);

  function setEtiquetaGrupoCosto(grupo: GrupoEtiquetas, monto: string) {
    setBorradorEtiquetaCosto((prev) => ({ ...prev, [grupo.clave]: monto }));
  }

  function confirmarEtiquetaGrupoCosto(grupo: GrupoEtiquetas) {
    const monto = borradorEtiquetaCosto[grupo.clave];
    if (monto === undefined) return;
    setBorradorEtiquetaCosto((prev) => {
      if (!(grupo.clave in prev)) return prev;
      const resto = { ...prev };
      delete resto[grupo.clave];
      return resto;
    });

    const actualizadas = { ...value.etiquetasPorInsumo };
    const filaDe = (insumoId: string) =>
      actualizadas[insumoId] ?? { precioUnitario: "", envio: "", precioCosto: "" };
    if (!monto.trim()) {
      for (const insumoId of grupo.insumoIds) {
        actualizadas[insumoId] = { ...filaDe(insumoId), precioCosto: "" };
      }
    } else {
      const total = parseMontoInput(monto);
      if (total === null) {
        for (const insumoId of grupo.insumoIds) {
          actualizadas[insumoId] = { ...filaDe(insumoId), precioCosto: monto };
        }
      } else {
        const partes = repartirPrecioEtiquetaGrupo(total, grupo.insumoIds.length);
        grupo.insumoIds.forEach((insumoId, i) => {
          actualizadas[insumoId] = { ...filaDe(insumoId), precioCosto: formatMontoDisplay(partes[i]) };
        });
      }
    }
    onChange({ ...value, etiquetasPorInsumo: actualizadas });
  }

  /** Cuenta explícita bajo el campo unificado, una vez repartido (no
   * mientras se escribe — el borrador todavía no tiene reparto ni total de
   * `calculo`, que sigue el estado ya guardado): botellas que usan este
   * grupo × precio cargado (las dos etiquetas) [+ IVA%] = total del grupo
   * en todo el pedido. Mismo formato que pidió Fran para el envasado
   * (`cuentaEnvaseCampo`): "300 × $ 220,00 + IVA 21% = $ 66.000,00". */
  function cuentaEtiquetaGrupo(campo: (typeof camposEtiqueta)[number]): string | null {
    if (!calculo || campo.grupo.clave in borradorEtiqueta) return null;
    const precioCargado = parseCampo(campo.valor);
    if (precioCargado === null) return null;
    const totalGrupoCentavos = calculo.etiquetas
      .filter((e) => campo.grupo.insumoIds.includes(e.insumoId))
      .reduce((acc, e) => acc + e.costoCentavos, 0);
    if (totalGrupoCentavos <= 0) return null;
    const unidades = items
      .filter((item) =>
        recetasEtiqueta.some(
          (r) => r.productoId === item.productoId && campo.grupo.insumoIds.includes(r.insumoId),
        ),
      )
      .reduce((acc, item) => acc + item.cantidad, 0);
    if (unidades <= 0) return null;
    return cuentaEnvaseCampo(unidades, precioCargado, totalGrupoCentavos, ivaPctNum, value.sinIva);
  }

  function hintEtiqueta(campo: (typeof camposEtiqueta)[number]): string {
    if (campo.precioEsDeUltimaCompra && campo.ultimaCompra) {
      return `Precio de la última compra — ${formatFechaSinAnio(campo.ultimaCompra.fecha)} (ya incluye IVA y envío)`;
    }
    const envio = " Si además pagás envío, sumalo directo acá.";
    const dosLados = campo.grupo.insumoIds.length > 1;
    const que = dosLados ? "las DOS etiquetas de una botella (frente + reverso) juntas" : "cada etiqueta";
    return value.sinIva
      ? `Lo que te cuesta${dosLados ? "n" : ""} ${que}, sin IVA.${envio} El 21% se suma recién al guardar.`
      : `Lo que te cuesta${dosLados ? "n" : ""} ${que}, con IVA incluido.${envio}`;
  }

  if (etiquetas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
        Etiquetas
      </span>
      {avisoEtiquetaLegado && (
        <p className="text-[11px] leading-[1.5] text-accent">
          Este pedido tenía las etiquetas cargadas con el formato
          anterior: revisá los precios antes de guardar.
        </p>
      )}
      {/* Fran (dueño): en un mismo pedido todas las etiquetas van
          iguales (con o sin IVA) — UN solo tilde para toda la sección,
          no uno por renglón (antes confundía: parecía que cada
          etiqueta podía tener su propio IVA, y tocar una cambiaba
          todas igual). */}
      <div className="flex flex-col gap-0.5">
        <label className="flex min-h-11 items-center gap-2.5 text-[13px] text-text">
          <input
            type="checkbox"
            checked={value.sinIva}
            onChange={(event) => onChange({ ...value, sinIva: event.target.checked })}
            className="h-4 w-4 shrink-0"
          />
          {soloCosto ? "Para el costo, las etiquetas son sin IVA" : "Pagaste las etiquetas sin IVA"}
        </label>
        <p className="pl-[34px] text-[11px] leading-[1.5] text-text-muted">
          {soloCosto
            ? "Al costo de reposición se le suma el 21% de IVA."
            : "Al costo de cada botella se le suma el 21% de IVA — no cambia lo que ya pagaste."}
        </p>
      </div>
      {camposEtiqueta.map((campo) => {
        const dosLados = campo.grupo.insumoIds.length > 1;
        const cuenta = cuentaEtiquetaGrupo(campo);
        const campoCosto = camposEtiquetaCosto.find((c) => c.grupo.clave === campo.grupo.clave)!;
        return (
          <div key={campo.grupo.clave} className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0">
            <div className="flex flex-col gap-1">
              <MoneyField
                id={`etiqueta-precio-${campo.grupo.clave}`}
                label={
                  soloCosto
                    ? dosLados
                      ? `${campo.grupo.nombre} — precio para el costo (frente + reverso)`
                      : `${campo.grupo.nombre} — precio para el costo`
                    : dosLados
                      ? `${campo.grupo.nombre} — frente + reverso`
                      : `${campo.grupo.nombre} — precio por unidad`
                }
                value={campo.valor}
                onChange={(v) => setEtiquetaGrupo(campo.grupo, v)}
                onBlur={() => confirmarEtiquetaGrupo(campo.grupo)}
                hint={hintEtiqueta(campo)}
              />
              {cuenta && (
                <p className="pl-1 text-[11px] leading-snug tabular-nums text-text-muted">{cuenta}</p>
              )}
            </div>
            {!soloCosto && (
              <MoneyField
                id={`etiqueta-precio-costo-${campo.grupo.clave}`}
                label={`${campo.grupo.nombre} — precio para el costo de la ${NEGOCIO.envase.singular}`}
                value={campoCosto.valor}
                onChange={(v) => setEtiquetaGrupoCosto(campo.grupo, v)}
                onBlur={() => confirmarEtiquetaGrupoCosto(campo.grupo)}
                hint="Con este precio se calcula cuánto cuesta cada botella. Vacío = usa el mismo de arriba. No cambia lo que ya pagaste."
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
