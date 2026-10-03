import Link from "next/link";
import type { ReactNode } from "react";

import { CuentaHeader } from "@/components/plata/cuenta-header";
import { ListaTareas } from "@/components/tareas/lista-tareas";
import type { InicioDatos } from "@/lib/data/inicio";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

function Bloque({
  titulo,
  children,
  enlace,
  className = "",
}: {
  titulo: string;
  children: ReactNode;
  enlace?: { href: string; texto: string };
  className?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2.5">
        <h2 className="text-[10px] tracking-[0.22em] text-text-muted uppercase">{titulo}</h2>
        <span className="h-px flex-1 bg-[linear-gradient(to_right,var(--color-border),transparent)]" />
        {enlace && (
          <Link
            href={enlace.href}
            className="shrink-0 border-b border-mark text-[10px] tracking-[0.14em] text-text uppercase"
          >
            {enlace.texto}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-text-muted">{children}</p>;
}

/**
 * Inicio del admin (rediseño de 4 bloques, 2026-09-16 — decisión de Fran):
 * responde "¿qué tengo que hacer hoy y cómo estamos?" en cuatro bloques:
 * Lo más urgente (hasta 3 tareas), Plata (Cuenta Ananja + en manos de),
 * Ventas del mes (una sola cifra, "Ingreso de Ananja" + variación) y
 * Depósito (solo si hay presentaciones bajo el mínimo). "Le deben a
 * Ananja"/"Lo que debe Ananja" viven en `/plata`; la ganancia detallada y
 * el gráfico viven en `/ganancia`.
 *
 * Server Component: los datos llegan armados por `cargarInicio`
 * (`lib/data/inicio.ts`); a los componentes cliente solo se les pasan
 * datos planos.
 */
export function InicioVista({ datos }: { datos: InicioDatos }) {
  const { resumen } = datos.ventas;
  const totalEnManos = datos.enManos.reduce((acc, p) => acc + p.totalCentavos, 0);
  const nombresEnManos = datos.enManos.map((p) => (p.soyYo ? "Vos" : p.nombre));

  return (
    <div className="@container flex w-full flex-col gap-8 pb-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">{datos.fechaLarga}</span>
          <h1 className="font-display text-[30px] leading-[1.05] break-words text-text @3xl:text-[38px]">
            {datos.saludo}
            {datos.nombre ? `, ${datos.nombre}` : ""}
          </h1>
        </div>
        <div className="flex gap-2.5">
          <Link
            href="/comprobantes/nuevo"
            className="flex min-h-[48px] flex-[1.4] items-center justify-center bg-primary text-xs font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
          >
            + Comprobante
          </Link>
          <Link
            href="/gastos/nuevo"
            className="flex min-h-[48px] flex-1 items-center justify-center border border-primary text-xs font-medium tracking-[0.12em] text-primary uppercase transition-colors hover:bg-primary/[.06]"
          >
            + Gasto
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-10 gap-y-9 @4xl:grid-cols-2">
        {/* 1 · Tareas */}
        <Bloque
          titulo="Lo más urgente"
          enlace={
            datos.hayTareas
              ? {
                  href: "/tareas",
                  texto: datos.totalTareasBadge > 0 ? `Ver todas (${datos.totalTareasBadge})` : "Ver todas",
                }
              : undefined
          }
        >
          {datos.errorTareas ? (
            <p role="alert" className="py-2 text-sm text-accent">
              No se pudieron cargar las tareas.
            </p>
          ) : datos.tareasTop.length === 0 ? (
            <Vacio>Todo al día.</Vacio>
          ) : (
            <ListaTareas tareas={datos.tareasTop} medioDeposito={datos.medioDeposito} />
          )}
        </Bloque>

        {/* 2 · Plata */}
        <Bloque titulo="Plata" enlace={{ href: "/plata", texto: "Ver plata" }}>
          <CuentaHeader
            compacto
            cuentaTotal={datos.cuenta.totalCentavos}
            saldoCuenta={{ mercado_pago: datos.cuenta.mercadoPagoCentavos, banco: datos.cuenta.bancoCentavos }}
            totalEnManos={totalEnManos}
            nombresEnManos={nombresEnManos}
          />
        </Bloque>

        {/* 3 · Ventas del mes */}
        <Bloque
          titulo={`Ventas de ${datos.ventas.nombreMes.toLowerCase()}`}
          enlace={{ href: "/ganancia", texto: "Ver ganancia" }}
        >
          {datos.ventas.vacio ? (
            <Vacio>Todavía no hay ventas para mostrar.</Vacio>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
                Ingreso de {NEGOCIO.nombre}
              </span>
              <span className="font-display text-[clamp(2rem,1.6rem+2cqw,3rem)] leading-none text-text tabular-nums">
                {formatCentavos(resumen.actual.ingresoAnanjaCentavos)}
              </span>
              <span className="text-xs text-text-muted tabular-nums">
                {resumen.variacionIngresoPct !== null && (
                  <span className={resumen.variacionIngresoPct >= 0 ? "text-secondary" : "text-accent"}>
                    {resumen.variacionIngresoPct >= 0 ? "+" : ""}
                    {resumen.variacionIngresoPct}%{" "}
                  </span>
                )}
                vs {datos.ventas.nombreMesAnterior.toLowerCase()}
              </span>
            </div>
          )}
        </Bloque>

        {/* 4 · Depósito — solo si hay algo bajo el mínimo */}
        {datos.stockBajo.length > 0 && (
          <Bloque titulo="Depósito" enlace={{ href: "/stock", texto: "Ver depósito" }}>
            <div className="flex flex-col">
              {datos.stockBajo.map((s) => (
                <div key={s.productoId} className="border-b border-border py-2.5 text-sm text-accent last:border-b-0">
                  {s.presentacion} quedó en {s.stock} · mínimo {s.umbral ?? "—"}
                </div>
              ))}
            </div>
          </Bloque>
        )}
      </div>
    </div>
  );
}
