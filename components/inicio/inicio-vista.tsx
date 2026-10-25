import Link from "next/link";
import type { ReactNode } from "react";

import { ListaTareas } from "@/components/tareas/lista-tareas";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import type { InicioDatos } from "@/lib/data/inicio";
import { formatCentavos } from "@/lib/money";

/** Cuántas pastillas de stock bajo se muestran antes de "y N más". */
const MAX_STOCK_BAJO = 2;

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-text-muted"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6 shrink-0 text-secondary"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </svg>
  );
}

/** Tarjeta entera tocable: un solo `<Link>` con chevron a la derecha. */
function TarjetaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-background lg:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      <Chevron />
    </Link>
  );
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="text-[15px] text-text-muted">{children}</span>;
}

function Numero({ children, debe = false }: { children: ReactNode; debe?: boolean }) {
  return (
    <span
      className={`font-display text-[32px] leading-none break-words tabular-nums ${debe ? "text-accent" : "text-text"}`}
    >
      {children}
    </span>
  );
}

function Detalle({ children }: { children: ReactNode }) {
  return <span className="text-[14px] text-text-muted">{children}</span>;
}

function textoPersonas(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "persona" : "personas"}`;
}

/**
 * Hoy (rediseño 2026-10, fase 3): responde "¿qué tengo que hacer y cómo
 * estamos?". A la izquierda "Para hacer" (las 3 tareas más urgentes) y a la
 * derecha "Cómo estamos": tres tarjetas tocables (plata en la cuenta, te
 * deben, botellas en el depósito) y la línea de la ganancia del mes. En
 * pantalla angosta van una debajo de la otra. Cada cifra sale de la misma
 * función que la pantalla de origen (ver `lib/data/inicio.ts`).
 *
 * Server Component: los datos llegan armados por `cargarInicio`; a los
 * componentes cliente solo se les pasan datos planos.
 */
export function InicioVista({ datos }: { datos: InicioDatos }) {
  const { enManos, ganancia, stockBajo } = datos;
  const stockVisible = stockBajo.slice(0, MAX_STOCK_BAJO);
  const stockOculto = stockBajo.length - stockVisible.length;

  return (
    <div className="@container flex w-full flex-col gap-6 pb-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] leading-[1.1] break-words text-text">
          {datos.saludo}
          {datos.nombre ? `, ${datos.nombre}` : ""}
        </h1>
        <p className="text-[15px] text-text-muted">{datos.fechaLarga}</p>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 @3xl:grid-cols-2 @3xl:gap-8">
        {/* Para hacer */}
        <Tarjeta como="section" aria-labelledby="hoy-para-hacer" className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <h2 id="hoy-para-hacer" className="font-display text-[20px] leading-tight text-text">
              Para hacer
            </h2>
            {datos.totalTareas > 0 && <Pastilla variante="neutra">{datos.totalTareas}</Pastilla>}
          </div>

          {datos.errorTareas ? (
            <p role="alert" className="text-[16px] text-accent">
              No se pudieron cargar las tareas.
            </p>
          ) : datos.tareasTop.length === 0 ? (
            <p className="flex items-center gap-2.5 text-[16px] text-text">
              <IconoCheck />
              No hay nada pendiente.
            </p>
          ) : (
            <>
              <ListaTareas tareas={datos.tareasTop} medioDeposito={datos.medioDeposito} />
              <Link
                href="/tareas"
                className="flex min-h-11 items-center justify-between gap-2 border-t border-line pt-3 text-[16px] font-semibold text-text"
              >
                Ver las {datos.totalTareas} cosas
                <Chevron />
              </Link>
            </>
          )}
        </Tarjeta>

        {/* Cómo estamos */}
        <section aria-labelledby="hoy-como-estamos" className="flex min-w-0 flex-col gap-3">
          <h2 id="hoy-como-estamos" className="font-display text-[20px] leading-tight text-text">
            Cómo estamos
          </h2>

          <TarjetaLink href="/plata">
            <Etiqueta>Plata en la cuenta</Etiqueta>
            <Numero>{formatCentavos(datos.cuentaTotalCentavos)}</Numero>
            <Detalle>
              {enManos.cantidad > 0
                ? `Y ${formatCentavos(enManos.totalCentavos)} en manos de ${textoPersonas(enManos.cantidad)}`
                : "Nadie tiene plata en mano"}
            </Detalle>
          </TarjetaLink>

          <TarjetaLink href="/plata">
            <Etiqueta>Te deben</Etiqueta>
            <Numero debe={datos.leDebenCentavos > 0}>{formatCentavos(datos.leDebenCentavos)}</Numero>
            {datos.leDebenCentavos <= 0 && <Detalle>Nadie te debe</Detalle>}
          </TarjetaLink>

          <TarjetaLink href="/stock">
            <Etiqueta>Botellas en el depósito</Etiqueta>
            <Numero>{datos.botellasDeposito}</Numero>
            {stockBajo.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5 pt-1">
                {stockVisible.map((s) => (
                  <Pastilla key={s.productoId} variante="aviso">
                    {s.presentacion}: quedan {s.stock}
                  </Pastilla>
                ))}
                {stockOculto > 0 && <Detalle>y {stockOculto} más</Detalle>}
              </span>
            )}
          </TarjetaLink>

          {ganancia && (
            <TarjetaLink href="/ganancia">
              {ganancia.algunCostoCargado ? (
                <>
                  <span className="text-[16px] text-text">
                    Este mes ganaste{" "}
                    <span
                      className={`font-display tabular-nums ${ganancia.centavos < 0 ? "text-accent" : "text-text"}`}
                    >
                      {formatCentavos(ganancia.centavos)}
                    </span>
                  </span>
                  {ganancia.variacionPct !== null && (
                    <span>
                      <Pastilla variante={ganancia.variacionPct >= 0 ? "ok" : "debe"}>
                        {ganancia.variacionPct >= 0 ? "+" : "−"}
                        {Math.abs(ganancia.variacionPct)}% vs. {ganancia.nombreMesAnterior.toLowerCase()}
                      </Pastilla>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[16px] text-text">Este mes todavía no hay ganancia con costos cargados</span>
              )}
            </TarjetaLink>
          )}
        </section>
      </div>
    </div>
  );
}
