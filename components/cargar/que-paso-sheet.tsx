"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import {
  IconCerrar,
  IconCashBox,
  IconExpense,
  IconInsumos,
  IconLotes,
  IconReceipt,
  IconRevendedores,
} from "@/components/icons";
import { formasProveedor } from "@/lib/dominio/proveedor";

export type RevendedoraOpcion = { id: string; nombre: string };

type Seccion = "entrega" | "ventas" | "pago";

type Paso =
  | { tipo: "inicio" }
  | { tipo: "elegir"; seccion: Seccion };

/** Textos del paso 2 (elegir quién) según lo que pasó. `extra` es la
 * opción que no es una revendedora. */
const ELEGIR: Record<
  Seccion,
  { titulo: string; extra: { titulo: string; ayuda: string; href: string } | null }
> = {
  ventas: {
    titulo: "¿Quién vendió?",
    extra: { titulo: "Ananja, a un cliente", ayuda: "una venta de Ananja", href: "/comprobantes/nuevo" },
  },
  pago: {
    titulo: "¿Quién te pagó?",
    extra: { titulo: "Un cliente", ayuda: "se cobra desde su ficha", href: "/clientes" },
  },
  entrega: { titulo: "¿A quién le entregaste?", extra: null },
};

type Opcion = {
  id: string;
  titulo: string;
  ayuda: string;
  Icono: ComponentType<{ className?: string }>;
} & ({ href: string } | { siguiente: Seccion });

function opcionesDeInicio(proveedor: string): Opcion[] {
  return [
    { id: "vendi", titulo: "Vendí", ayuda: "a un cliente o una revendedora", Icono: IconReceipt, siguiente: "ventas" },
    { id: "pagaron", titulo: "Me pagaron", ayuda: "una revendedora o un cliente", Icono: IconCashBox, siguiente: "pago" },
    { id: "gasto", titulo: "Pagué un gasto", ayuda: "con foto de la factura", Icono: IconExpense, href: "/gastos/nuevo" },
    { id: "entregue", titulo: "Entregué botellas", ayuda: "a una revendedora", Icono: IconRevendedores, siguiente: "entrega" },
    { id: "pedido", titulo: "Llegó un pedido", ayuda: proveedor, Icono: IconLotes, href: "/stock/lotes/nuevo" },
    { id: "insumos", titulo: "Compré insumos", ayuda: "aceite, etiquetas, envases", Icono: IconInsumos, href: "/stock/insumos/factura" },
  ];
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled])';

const TARJETA =
  "flex min-h-[104px] w-full flex-col items-start gap-2 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-background active:bg-background";

function Circulo({ Icono }: { Icono: ComponentType<{ className?: string }> }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1eb] text-primary">
      <Icono className="h-5 w-5" />
    </span>
  );
}

/**
 * Hoja "¿Qué pasó?" — el botón "+" (tab bar móvil y rail de escritorio)
 * abre esto. Seis cosas que pasan en el negocio, cada una lleva a la
 * pantalla justa; las que dependen de una persona piden elegirla en un
 * segundo paso dentro de la misma hoja. Foco atrapado, Escape cierra.
 */
export function QuePasoSheet({
  open,
  onClose,
  revendedoras,
  proveedorNombre,
}: {
  open: boolean;
  onClose: () => void;
  revendedoras: RevendedoraOpcion[];
  proveedorNombre: string | null;
}) {
  return (
    <BottomSheet open={open} ariaLabel="¿Qué pasó?" anchoMaximo="sm:max-w-lg">
      {/* Se monta solo con la hoja abierta: cada vez arranca en el paso 1
          y con el buscador vacío, sin resetear estado a mano. */}
      <Contenido onClose={onClose} revendedoras={revendedoras} proveedorNombre={proveedorNombre} />
    </BottomSheet>
  );
}

function Contenido({
  onClose,
  revendedoras,
  proveedorNombre,
}: {
  onClose: () => void;
  revendedoras: RevendedoraOpcion[];
  proveedorNombre: string | null;
}) {
  const [paso, setPaso] = useState<Paso>({ tipo: "inicio" });
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement>(null);

  // Foco: al abrir y en cada paso va al título; Tab queda adentro; Escape cierra.
  useEffect(() => {
    contenedor.current?.querySelector<HTMLElement>("[data-foco]")?.focus();
  }, [paso]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodos = contenedor.current?.querySelectorAll<HTMLElement>(FOCUSABLES);
      if (!nodos || nodos.length === 0) return;
      const primero = nodos[0];
      const ultimo = nodos[nodos.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || !contenedor.current?.contains(activo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !contenedor.current?.contains(activo))) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const proveedor = formasProveedor(proveedorNombre).de;
  const opciones = useMemo(() => opcionesDeInicio(proveedor), [proveedor]);

  const filtradas = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return q ? revendedoras.filter((r) => sinAcentos(r.nombre).includes(q)) : revendedoras;
  }, [revendedoras, busqueda]);

  return (
    <div ref={contenedor}>
      {paso.tipo === "inicio" ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 tabIndex={-1} data-foco className="text-[24px] leading-tight font-bold text-text outline-none">
                ¿Qué pasó?
              </h2>
              <p className="mt-1 text-[15px] text-text-muted">Elegí y te llevo al lugar justo</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-text-muted"
            >
              <IconCerrar className="h-5 w-5" />
            </button>
          </div>
          <ul className="mt-5 grid grid-cols-1 gap-3 min-[340px]:grid-cols-2">
            {opciones.map((o) => (
              <li key={o.id}>
                {"href" in o ? (
                  <Link prefetch={false} href={o.href} onClick={onClose} className={TARJETA}>
                    <Circulo Icono={o.Icono} />
                    <span className="text-[17px] leading-tight font-semibold text-text">{o.titulo}</span>
                    <span className="text-[14px] leading-snug text-text-muted">{o.ayuda}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda("");
                      setPaso({ tipo: "elegir", seccion: o.siguiente });
                    }}
                    className={TARJETA}
                  >
                    <Circulo Icono={o.Icono} />
                    <span className="text-[17px] leading-tight font-semibold text-text">{o.titulo}</span>
                    <span className="text-[14px] leading-snug text-text-muted">{o.ayuda}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPaso({ tipo: "inicio" })}
              className="-ml-2 flex min-h-11 items-center px-2 text-[16px] font-medium text-primary"
            >
              ‹ Volver
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-text-muted"
            >
              <IconCerrar className="h-5 w-5" />
            </button>
          </div>
          <h2 tabIndex={-1} data-foco className="mt-1 text-[24px] leading-tight font-bold text-text outline-none">
            {ELEGIR[paso.seccion].titulo}
          </h2>

          {ELEGIR[paso.seccion].extra && (
            <Link
              prefetch={false}
              href={ELEGIR[paso.seccion].extra!.href}
              onClick={onClose}
              className="mt-4 flex min-h-14 flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-2 hover:bg-background"
            >
              <span className="text-[17px] font-semibold text-text">{ELEGIR[paso.seccion].extra!.titulo}</span>
              <span className="text-[14px] text-text-muted">{ELEGIR[paso.seccion].extra!.ayuda}</span>
            </Link>
          )}

          <label className="mt-4 block">
            <span className="sr-only">Buscar revendedora</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar revendedora"
              autoComplete="off"
              className="min-h-12 w-full rounded-xl border border-[#d0cec8] bg-surface px-4 text-[16px] text-text placeholder:text-text-muted"
            />
          </label>

          {filtradas.length === 0 ? (
            <p className="mt-4 text-[15px] text-text-muted">
              {revendedoras.length === 0 ? "No hay revendedoras activas." : "No encontramos a nadie con ese nombre."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col">
              {filtradas.map((r) => (
                <li key={r.id} className="border-b border-border last:border-b-0">
                  <Link
                    prefetch={false}
                    href={`/revendedores/${r.id}/carga?seccion=${paso.seccion}`}
                    onClick={onClose}
                    className="flex min-h-12 items-center justify-between gap-3 py-2 text-[17px] text-text"
                  >
                    <span>{r.nombre}</span>
                    <span aria-hidden="true" className="text-text-muted">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
