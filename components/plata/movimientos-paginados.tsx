"use client";

import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { claseChip } from "@/components/ui/chip";
import { useMemo, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { ListaMovimientos, type ItemMovimiento } from "@/components/caja/lista-movimientos";
import { cargarMovimientosPlata, itemsGenerales } from "@/lib/data/plata";
import { createClient } from "@/lib/supabase/client";

type FiltroMovimiento = "todo" | "entradas" | "salidas";

const FILTROS: { id: FiltroMovimiento; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "entradas", label: "Entradas" },
  { id: "salidas", label: "Salidas" },
];

/** Entrada = suma a la plata de esta lista; salida = resta. Pasar plata de un
 * lugar a otro (`neutro`) no es ni una ni otra: solo aparece en "Todo". */
function pasaFiltro(item: ItemMovimiento, filtro: FiltroMovimiento): boolean {
  if (filtro === "todo") return true;
  if (item.neutro) return false;
  return filtro === "entradas" ? item.montoCentavos >= 0 : item.montoCentavos < 0;
}

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
  const [filtro, setFiltro] = useState<FiltroMovimiento>("todo");
  const visibles = useMemo(() => items.filter((i) => pasaFiltro(i, filtro)), [items, filtro]);

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
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2" role="group" aria-label="Filtrar movimientos">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={claseChip(filtro === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <ListaMovimientos
        items={visibles}
        vacio={
          items.length === 0
            ? vacio
            : `No hay ${filtro === "entradas" ? "entradas" : "salidas"} entre los movimientos cargados.`
        }
      />

      {error && <p role="alert" className="pt-3 text-[14px] text-accent">No se pudo cargar más. Probá de nuevo.</p>}

      {!agotado && (
        <BotonAccion
          cargando={cargando}
          textoCargando="Cargando…"
          onClick={verMas}
          className={`${BOTON_SECUNDARIO} mt-3 flex self-start px-4 hover:border-primary hover:text-primary`}
        >
          Ver más
        </BotonAccion>
      )}
    </div>
  );
}
