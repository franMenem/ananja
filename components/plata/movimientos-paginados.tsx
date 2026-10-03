"use client";

import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { ListaMovimientos, type ItemMovimiento } from "@/components/caja/lista-movimientos";
import { cargarMovimientosPlata, itemsGenerales } from "@/lib/data/plata";
import { createClient } from "@/lib/supabase/client";

/**
 * "Últimos movimientos" de `/plata` con "Ver más" — Fran no podía recorrer
 * el historial completo, la lista quedaba fija en los últimos 10 (pedido
 * 2026-09-18). En vez de un cursor, cada "Ver más" vuelve a pedir el
 * historial completo con un `limite` más grande (`cargarMovimientosPlata`
 * ya trae, por tabla, top-`limite` ordenado por fecha desde el server —
 * ver `lib/data/plata.ts` — así que nunca trae de más ni deja
 * un movimiento afuera al mezclar los ~8 orígenes). El orden (más nuevo
 * primero) no cambia.
 *
 * Corre en el browser (mismo patrón que `components/ver-como-revendedor.tsx`):
 * `cargarMovimientosPlata` no depende de un Server Component, solo de un
 * cliente Supabase — la RLS real protege los datos en cualquiera de los
 * dos casos.
 */
export function MovimientosPaginados({
  itemsIniciales,
  limiteInicial,
  paso,
  vacio,
}: {
  itemsIniciales: ItemMovimiento[];
  limiteInicial: number;
  paso: number;
  vacio: string;
}) {
  const [items, setItems] = useState(itemsIniciales);
  const [limite, setLimite] = useState(limiteInicial);
  const [cargando, setCargando] = useState(false);
  const [agotado, setAgotado] = useState(itemsIniciales.length < limiteInicial);
  const [error, setError] = useState(false);

  async function verMas() {
    setCargando(true);
    setError(false);
    const nuevoLimite = limite + paso;
    const supabase = createClient();
    try {
      const filas = await cargarMovimientosPlata(supabase, { tipo: "todo", limite: nuevoLimite });
      setItems(itemsGenerales(filas));
      setLimite(nuevoLimite);
      if (filas.length < nuevoLimite) setAgotado(true);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col">
      <ListaMovimientos items={items} vacio={vacio} />

      {error && <p className="pt-3 text-[12px] text-accent">No se pudo cargar más. Probá de nuevo.</p>}

      {!agotado && (
        <BotonAccion
          cargando={cargando}
          textoCargando="Cargando…"
          onClick={verMas}
          className="mt-3 flex min-h-11 items-center justify-center self-start border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase hover:border-primary hover:text-primary disabled:opacity-45"
        >
          Ver más
        </BotonAccion>
      )}
    </div>
  );
}
