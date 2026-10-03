"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { CategoriaSelect } from "@/app/(app)/gastos/categoria-select";
import { FormPage } from "@/components/app/form-page";
import { BotonAccion } from "@/components/boton-accion";
import { FacturaGastoSeccion } from "@/components/gastos/factura-gasto-seccion";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { BottomSheet } from "@/components/bottom-sheet";
import { obtenerGasto, type GastoRow } from "@/lib/data/gastos";
import { etiquetaMedioPago, type MedioPago } from "@/lib/etiquetas/medio-pago";
import { formatFecha } from "@/lib/fechas";
import { insumoDeMovimientos, tituloGasto } from "@/lib/dominio/gastos";
import { createClient } from "@/lib/supabase/client";
import { formatCentavos, parseMontoInput } from "@/lib/money";
import { useVendedorActual } from "@/lib/vendedor-actual";

type GastoDetallePageProps = {
  params: Promise<{ id: string }>;
};

const volver = { href: "/gastos", label: "Volver a gastos" };

export default function GastoDetallePage({ params }: GastoDetallePageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { vendedor } = useVendedorActual();
  const isAdmin = vendedor?.rol === "admin";

  const [gasto, setGasto] = useState<GastoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editing, setEditing] = useState(false);
  const [monto, setMonto] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch "puro": no toca estado de React, así se puede reutilizar tanto
  // desde el efecto de carga inicial como desde handleGuardar (tras editar)
  // sin disparar setState síncrono dentro del cuerpo del efecto.
  async function fetchGasto(): Promise<GastoRow | null> {
    const supabase = createClient();
    return obtenerGasto(supabase, id);
  }

  function aplicarGasto(row: GastoRow) {
    setGasto(row);
    setMonto(formatCentavos(row.monto_centavos).replace("$ ", ""));
    setCategoriaId(row.categoria_id);
    setMedioPago(row.medio_pago);
    setFecha(row.fecha);
    setNota(row.nota ?? "");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      setError(null);

      const resultado = await fetchGasto();
      if (cancelled) return;

      if (!resultado) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      aplicarGasto(resultado);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleGuardar(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const montoCentavos = parseMontoInput(monto);
    if (montoCentavos === null || montoCentavos <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    if (!categoriaId) {
      setError("Elegí una categoría.");
      return;
    }
    if (!medioPago) {
      setError("Elegí un medio de pago.");
      return;
    }
    if (!fecha) {
      setError("Ingresá una fecha.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("gastos")
        .update({
          monto_centavos: montoCentavos,
          categoria_id: categoriaId,
          medio_pago: medioPago,
          fecha,
          nota: nota.trim() || null,
        })
        .eq("id", id);

      if (updateError) {
        setSaving(false);
        setError("No pudimos guardar los cambios. Intentá de nuevo.");
        return;
      }

      const resultado = await fetchGasto();
      if (resultado) {
        aplicarGasto(resultado);
      }

      setSaving(false);
      setEditing(false);
    } catch {
      setSaving(false);
      setError(
        "No se pudo conectar. Verificá tu conexión e intentá de nuevo — no perdiste los cambios.",
      );
    }
  }

  async function handleEliminar() {
    setDeleting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("gastos")
        .delete()
        .eq("id", id);

      if (deleteError) {
        setDeleting(false);
        setError("No pudimos eliminar el gasto. Intentá de nuevo.");
        return;
      }

      router.push(volver.href);
    } catch {
      setDeleting(false);
      setError("No se pudo conectar. Verificá tu conexión e intentá de nuevo.");
    }
  }

  if (loading) {
    return <p className="py-6 text-sm text-text-muted">Cargando…</p>;
  }

  if (notFound || !gasto) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <span aria-hidden="true" className="h-0.5 w-10 bg-accent" />
        <p className="font-display text-[28px] leading-[1.2] text-primary">
          No encontramos este gasto.
        </p>
        <Link
          href={volver.href}
          className="text-[13px] font-medium tracking-[0.1em] text-accent uppercase"
        >
          {volver.label}
        </Link>
      </div>
    );
  }

  // Qué fue el gasto (insumo comprado, concepto pagado del pedido) — la
  // categoría queda como dato aparte, ver `tituloGasto` (lib/gastos.ts).
  const { titulo } = tituloGasto({
    categoriaNombre: gasto.categorias_gasto?.nombre,
    conceptoPago: gasto.concepto_pago,
    presentacionMl: gasto.productos?.presentacion_ml,
    insumoNombre: insumoDeMovimientos(gasto.movimientos_insumo),
  });

  return (
    <FormPage
      title={editing ? "Editar gasto" : "Detalle del gasto"}
      backHref={volver.href}
      backLabel={volver.label}
      maxWidth={760}
      pb
    >
      {error && (
        <p role="alert" className="text-[12px] text-accent">
          {error}
        </p>
      )}

      {editing ? (
        <form onSubmit={handleGuardar} className="flex flex-col gap-5">
          <MontoInput
            id="monto"
            label="Monto"
            value={monto}
            onChange={setMonto}
            required
            labelClassName="text-[10px] tracking-[0.22em] text-text-muted uppercase"
            cajaClassName="mt-1 flex items-baseline gap-2 border-b-2 border-primary pb-1"
            simboloClassName="font-display text-[22px] text-text-muted"
            inputClassName="font-display w-full min-w-0 bg-transparent text-[42px] text-primary tabular-nums"
          />

          <CategoriaSelect value={categoriaId} onChange={setCategoriaId} />

          <MedioPagoChips value={medioPago} onChange={setMedioPago} />

          <div>
            <label
              htmlFor="fecha"
              className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            >
              Fecha
            </label>
            <input
              id="fecha"
              type="date"
              required
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="nota"
              className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            >
              Nota (opcional)
            </label>
            <textarea
              id="nota"
              value={nota}
              onChange={(event) => setNota(event.target.value)}
              rows={3}
              className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
            />
          </div>

          <div className="flex gap-2">
            <BotonAccion
              cargando={saving}
              textoCargando="Guardando…"
              type="submit"
              className="min-h-12 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
            >
              Guardar cambios
            </BotonAccion>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="min-h-12 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <span className="block font-display text-[24px] leading-[1.15] break-words text-primary">
              {titulo}
            </span>
            <span className="font-display mt-1 block text-[46px] leading-[1] text-accent tabular-nums">
              {formatCentavos(gasto.monto_centavos)}
            </span>
          </div>

          <dl className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2 border-b border-border py-3">
              <dt className="text-[11px] text-text-muted uppercase">
                Categoría
              </dt>
              <dd className="text-right text-text">
                {gasto.categorias_gasto?.nombre ?? "Sin categoría"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-border py-3">
              <dt className="text-[11px] text-text-muted uppercase">
                Medio de pago
              </dt>
              <dd className="text-text">{etiquetaMedioPago(gasto.medio_pago)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-border py-3">
              <dt className="text-[11px] text-text-muted uppercase">
                Vendedor
              </dt>
              <dd className="text-text">
                {gasto.vendedores?.nombre ?? "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-border py-3">
              <dt className="text-[11px] text-text-muted uppercase">
                Fecha
              </dt>
              <dd className="text-text">{formatFecha(gasto.fecha)}</dd>
            </div>
            {gasto.nota && (
              <div className="flex items-baseline justify-between gap-2 border-b border-border py-3">
                <dt className="text-[11px] text-text-muted uppercase">
                  Nota
                </dt>
                <dd className="text-right text-text">{gasto.nota}</dd>
              </div>
            )}
          </dl>

          <FacturaGastoSeccion
            gastoId={gasto.id}
            imagenPath={gasto.imagen_path}
            isAdmin={isAdmin}
            onCambiada={(imagenPath) =>
              setGasto((prev) => (prev ? { ...prev, imagen_path: imagenPath } : prev))
            }
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-12 flex-1 border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-12 flex-1 border border-accent px-4 text-[13px] font-medium tracking-[0.14em] text-accent uppercase"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}

      <BottomSheet
        open={confirmingDelete}
        ariaLabel="Eliminar gasto"
        variant="accent"
      >
        <span className="text-[10px] tracking-[0.2em] text-accent uppercase">
          Eliminar gasto
        </span>
        <p className="font-display mt-2 text-[24px] leading-[1.3] text-primary">
          Se va a eliminar el gasto de {titulo} por{" "}
          {formatCentavos(gasto.monto_centavos)} y se devuelve ese monto a la
          caja {etiquetaMedioPago(gasto.medio_pago)}.
        </p>
        <p className="mt-2 text-[12px] text-text-muted">
          No se puede deshacer.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-[12px] text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className="min-h-12 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={deleting}
            textoCargando="Eliminando…"
            type="button"
            onClick={handleEliminar}
            className="min-h-12 flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </FormPage>
  );
}
