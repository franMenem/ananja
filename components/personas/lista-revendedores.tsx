"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { ChevronFila, FilaLink } from "@/components/ui/estado-fila";
import { ListaTarjeta } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { estadoPersona, sinAcentos, textoBotellas, type FilaRevendedor } from "@/lib/dominio/personas";
import { formatCentavos } from "@/lib/money";

function hrefFicha(f: FilaRevendedor): string {
  // `?rol=coordinador`: pista para que la ficha pida solo su tanda.
  return f.esCoordinadora ? `/revendedores/${f.id}?rol=coordinador` : `/revendedores/${f.id}`;
}

function detalleFila(f: FilaRevendedor, extra: string | null): string {
  const partes: string[] = [];
  if (f.esCoordinadora) {
    partes.push(`Coordinadora · ${f.aCargo} a cargo`);
  } else {
    partes.push(`Tiene ${textoBotellas(f.enPoder)}`);
    if (f.esAdmin) partes.push("Admin");
  }
  if (extra) partes.push(extra);
  return partes.join(" · ");
}

function EstadoPastilla({ f }: { f: FilaRevendedor }) {
  if (f.esCoordinadora) return null;
  const estado = estadoPersona(f.debeCentavos, f.porConfirmarCentavos);
  return <Pastilla variante={estado.variante}>{estado.texto}</Pastilla>;
}

/**
 * Lista de `/revendedores`: buscador por nombre (sin acentos) y una fila por
 * persona con un solo estado (debe / por confirmar / al día). Las filas
 * llegan ya ordenadas por deuda. En celular son filas; desde un ancho de
 * contenedor de 48rem pasa a tabla con las columnas Nombre · Botellas que
 * tiene · Valor de lo que tiene · Debe.
 */
export function ListaRevendedores({ filas }: { filas: FilaRevendedor[] }) {
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return q ? filas.filter((f) => sinAcentos(f.nombre).includes(q)) : filas;
  }, [filas, busqueda]);

  return (
    <div className="@container flex flex-col gap-4">
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre"
        aria-label="Buscar revendedor por nombre"
        className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] text-text placeholder:text-text-muted focus:border-primary"
      />

      {filas.length === 0 ? (
        <p className="py-6 text-[16px] text-text-muted">Todavía no hay ningún revendedor.</p>
      ) : visibles.length === 0 ? (
        <p className="py-6 text-[16px] text-text-muted">No hay nadie con ese nombre.</p>
      ) : (
        <>
          {/* Celular */}
          <ListaTarjeta className="@3xl:hidden">
            {visibles.map((f) => {
              const estado = estadoPersona(f.debeCentavos, f.porConfirmarCentavos);
              return (
                <FilaLink
                  key={f.id}
                  href={hrefFicha(f)}
                  izquierda={
                    <>
                      <Avatar nombre={f.nombre} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[16px] font-semibold break-words text-text">{f.nombre}</span>
                        <span className="text-[14px] text-text-muted">
                          {detalleFila(f, f.esCoordinadora ? null : estado.detalleExtra)}
                        </span>
                        {!f.esCoordinadora && (
                          <span className="mt-1.5 self-start">
                            <EstadoPastilla f={f} />
                          </span>
                        )}
                      </div>
                    </>
                  }
                  derecha={<ChevronFila />}
                />
              );
            })}
          </ListaTarjeta>

          {/* Escritorio */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface @3xl:block">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-4 border-b border-line px-5 py-3 text-[14px] text-text-muted">
              <span>Nombre</span>
              <span className="text-right">Botellas que tiene</span>
              <span className="text-right">Valor de lo que tiene</span>
              <span className="text-right">Debe</span>
            </div>
            <div className="divide-y divide-line">
              {visibles.map((f) => {
                const estado = estadoPersona(f.debeCentavos, f.porConfirmarCentavos);
                return (
                  <Link
                    key={f.id}
                    href={hrefFicha(f)}
                    className="grid min-h-14 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] items-center gap-4 px-5 py-2 text-[16px] transition-colors hover:bg-background"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar nombre={f.nombre} />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold break-words text-text">{f.nombre}</span>
                        {(f.esCoordinadora || f.esAdmin || estado.detalleExtra) && (
                          <span className="text-[14px] text-text-muted">
                            {f.esCoordinadora
                              ? `Coordinadora · ${f.aCargo} a cargo`
                              : [f.esAdmin ? "Admin" : null, estado.detalleExtra].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-right tabular-nums text-text">{f.esCoordinadora ? "—" : f.enPoder}</span>
                    <span className="text-right tabular-nums text-text">
                      {f.esCoordinadora ? "—" : formatCentavos(f.valorEnPoderCentavos)}
                    </span>
                    <span className="flex justify-end">
                      <EstadoPastilla f={f} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
