"use client";

import { useRef, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import {
  firmaBusqueda,
  hayQueBuscarParecidas,
  textoCargasParecidas,
  type BusquedaParecidas,
  type CargaParecida,
} from "@/lib/dominio/cargas-parecidas";
import { hoyEnArgentina } from "@/lib/fechas";
import { buscarCargasParecidas } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";

/**
 * Aviso de carga repetida de las pantallas de admin de una revendedora
 * ("Entregar", "Cargar todo junto", "Cargar ventas", "Registrar pago") —
 * `buscar_cargas_parecidas` (0045 § 2), `lib/cargas-parecidas.ts`.
 *
 * Uso: antes de guardar, `if (!(await aviso.puedeGuardar(busqueda))) return;`.
 * Si hay algo parecido queda `aviso.parecidas` para mostrar
 * `<AvisoCargaRepetida>`. "Guardar igual" = `aviso.guardarIgual()` y volver a
 * correr el MISMO guardado: esa búsqueda ya no pregunta; si mientras tanto se
 * editó el formulario, la firma cambia y se vuelve a buscar.
 */
export function useCargasParecidas(vendedorId: string) {
  const [parecidas, setParecidas] = useState<CargaParecida[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  // Refs (no estado): "Guardar igual" acepta y enseguida vuelve a guardar,
  // en el mismo evento, sin esperar un render.
  const firmaMostrada = useRef<string | null>(null);
  const firmaAceptada = useRef<string | null>(null);

  async function puedeGuardar(busqueda: BusquedaParecidas, clave?: string): Promise<boolean> {
    setParecidas(null);
    if (!hayQueBuscarParecidas(busqueda, firmaAceptada.current)) return true;

    setBuscando(true);
    const lista = await buscarCargasParecidas(createClient(), { vendedorId, busqueda, clave });
    setBuscando(false);
    if (lista.length === 0) return true;

    firmaMostrada.current = firmaBusqueda(busqueda);
    setParecidas(lista);
    return false;
  }

  function guardarIgual() {
    firmaAceptada.current = firmaMostrada.current;
    setParecidas(null);
  }

  function revisar() {
    setParecidas(null);
  }

  return { parecidas, buscando, puedeGuardar, guardarIgual, revisar };
}

export function AvisoCargaRepetida({
  parecidas,
  cargando,
  onGuardarIgual,
  onRevisar,
}: {
  parecidas: CargaParecida[];
  cargando: boolean;
  onGuardarIgual: () => void;
  onRevisar: () => void;
}) {
  const aviso = textoCargasParecidas(parecidas, hoyEnArgentina());

  return (
    <div role="alert" className="flex flex-col gap-3 border-t-2 border-accent pt-3">
      <p className="text-sm text-accent">{aviso.resumen}</p>
      {aviso.detalle.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12px] text-text-muted">
          {aviso.detalle.map((linea, i) => (
            <li key={`${parecidas[i]?.id ?? i}`}>· {linea}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonAccion
          cargando={cargando}
          textoCargando="Guardando…"
          onClick={onGuardarIgual}
          className="flex min-h-[54px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Guardar igual
        </BotonAccion>
        <button
          type="button"
          onClick={onRevisar}
          disabled={cargando}
          className="flex min-h-[54px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
        >
          Revisar
        </button>
      </div>
    </div>
  );
}
