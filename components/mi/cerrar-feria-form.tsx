"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { BotonAccion } from "@/components/boton-accion";
import { CantidadStepper } from "@/components/cantidad-stepper";
import { MontoInput } from "@/components/monto-input";
import { SetFormHeader } from "@/components/page-header-context";
import { AccionesForm } from "@/components/ui/acciones-form";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import {
  AreaTexto,
  CLASE_CAJA_MONTO,
  CLASE_ETIQUETA,
  CLASE_INPUT_MONTO_GRANDE,
  Campo,
  Entrada,
  MensajeError,
} from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
import { textoDiferencia } from "@/components/mi/feria-vista";
import { campoNumericoInvalido } from "@/lib/dominio/campo-numerico";
import {
  calcularCierreFeria,
  diferenciaPlata,
  mensajeErrorFeria,
  type ProductoCierreFeria,
} from "@/lib/dominio/feria";
import { hoyISO } from "@/lib/fechas";
import { feriaCerrarParticipacion } from "@/lib/ferias";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { envase } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

export type ProductoCierreForm = Omit<ProductoCierreFeria, "yaVendidas"> & {
  yaVendidas: number;
  /** Degustación que el admin ya le cargó (a cargo de Ananja). No se descuenta de lo que se llevó. */
  degustadasCarga?: number;
};

function montoAProcesar(texto: string): number | null {
  return texto.trim() === "" ? 0 : parseMontoInput(texto);
}

/**
 * "Cerrar mi feria" (`/mi/feria/cerrar`) — por producto, cuántas devuelve y
 * cuántas usó para degustar; lo demás se considera vendido (llevadas − ya
 * vendidas − devueltas − degustadas) al precio de feria, que puede corregir.
 * Abajo, cuánta plata juntó por medio (la diferencia con lo vendido es solo
 * informativa). Antes de guardar muestra un resumen para confirmar.
 */
export function CerrarFeriaForm({
  feriaId,
  productos,
}: {
  feriaId: string;
  productos: ProductoCierreForm[];
}) {
  const router = useRouter();
  const [devueltas, setDevueltas] = useState<Record<string, number>>({});
  const [degustadas, setDegustadas] = useState<Record<string, number>>({});
  const [precios, setPrecios] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      productos.map((p) => [
        p.productoId,
        p.precioCentavos !== null && p.precioCentavos > 0 ? formatMontoDisplay(p.precioCentavos) : "",
      ]),
    ),
  );
  const [efectivo, setEfectivo] = useState("");
  const [mercadoPago, setMercadoPago] = useState("");
  const [banco, setBanco] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preciosParseados: Record<string, number | null> = Object.fromEntries(
    productos.map((p) => [p.productoId, parseMontoInput(precios[p.productoId] ?? "")]),
  );
  const cierre = calcularCierreFeria(productos, devueltas, degustadas, preciosParseados);
  const efectivoC = montoAProcesar(efectivo);
  const mpC = montoAProcesar(mercadoPago);
  const bancoC = montoAProcesar(banco);
  const juntado = (efectivoC ?? 0) + (mpC ?? 0) + (bancoC ?? 0);
  const totalVendidas = cierre.filas.reduce((a, f) => a + Math.max(f.vendidas, 0), 0);
  const totalDevueltas = cierre.filas.reduce((a, f) => a + f.devueltas, 0);
  const hayPlata = efectivo.trim() !== "" || mercadoPago.trim() !== "" || banco.trim() !== "";

  function validar(): string | null {
    if (cierre.errores.length > 0) return cierre.errores[0];
    if (
      productos.some((p) => campoNumericoInvalido(precios[p.productoId] ?? "")) ||
      campoNumericoInvalido(efectivo) ||
      campoNumericoInvalido(mercadoPago) ||
      campoNumericoInvalido(banco) ||
      efectivoC === null ||
      mpC === null ||
      bancoC === null
    ) {
      return "Revisá los montos: hay algo que no se entiende.";
    }
    if (!fecha) return "Poné la fecha.";
    return null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problema = validar();
    setError(problema);
    if (!problema) setConfirmando(true);
  }

  async function handleConfirmar() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await feriaCerrarParticipacion(supabase, {
      feriaId,
      vendedorId: null,
      fecha,
      devueltas: productos.map((p) => ({ productoId: p.productoId, cantidad: devueltas[p.productoId] ?? 0 })),
      degustadas: productos.map((p) => ({ productoId: p.productoId, cantidad: degustadas[p.productoId] ?? 0 })),
      precios: productos.flatMap((p) => {
        const c = preciosParseados[p.productoId];
        return c !== null && c > 0 ? [{ productoId: p.productoId, precioCentavos: c }] : [];
      }),
      efectivoCentavos: efectivoC ?? 0,
      mercadoPagoCentavos: mpC ?? 0,
      bancoCentavos: bancoC ?? 0,
      nota: nota.trim() || null,
    });

    if (rpcError) {
      setConfirmando(false);
      setError(mensajeErrorFeria(rpcError.message));
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/mi/feria");
    router.refresh();
  }

  return (
    <>
      <SetFormHeader title="Cerrar mi feria" backHref="/mi/feria" backLabel="Volver a mi feria" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <SeccionForm titulo="¿Qué pasó con lo que te llevaste?">
          <div className="flex flex-col gap-5 divide-y divide-line">
            {cierre.filas.map((f, i) => {
              const p = productos[i];
              const disponible = p.entregadas - p.yaVendidas;
              return (
                <div key={f.productoId} className="flex flex-col gap-3 pt-5 first:pt-0">
                  <div className="flex flex-col">
                    <span className="text-[17px] font-semibold text-text">{f.nombre}</span>
                    <span className="text-[14px] text-text-muted">
                      Te llevaste {p.entregadas}
                      {(p.degustadasCarga ?? 0) > 0 && ` · ya tenés ${p.degustadasCarga} para degustación`}
                      {p.yaVendidas > 0 && ` · ya vendiste ${p.yaVendidas}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <div>
                      <span className={CLASE_ETIQUETA}>Devolvés</span>
                      <div className="mt-1.5">
                        <CantidadStepper
                          size="sm"
                          value={f.devueltas}
                          onChange={(n) => setDevueltas((d) => ({ ...d, [f.productoId]: n }))}
                          min={0}
                          max={Math.max(disponible - f.degustadas, 0)}
                          ariaLabelSufijo={` de ${f.nombre} que devolvés`}
                        />
                      </div>
                    </div>
                    <div>
                      <span className={CLASE_ETIQUETA}>
                        {(p.degustadasCarga ?? 0) > 0 ? "Degustación extra" : "Degustación"}
                      </span>
                      <div className="mt-1.5">
                        <CantidadStepper
                          size="sm"
                          value={f.degustadas}
                          onChange={(n) => setDegustadas((d) => ({ ...d, [f.productoId]: n }))}
                          min={0}
                          max={Math.max(disponible - f.devueltas, 0)}
                          ariaLabelSufijo={` de ${f.nombre} para degustación`}
                        />
                      </div>
                    </div>
                  </div>
                  <MontoInput
                    id={`precio-${f.productoId}`}
                    label={`Precio por ${envase(1)}`}
                    value={precios[f.productoId] ?? ""}
                    onChange={(v) => setPrecios((d) => ({ ...d, [f.productoId]: v }))}
                    placeholder="$ 0,00"
                    simbolo={null}
                    cajaClassName={CLASE_CAJA_MONTO}
                    inputClassName={CLASE_INPUT_MONTO_GRANDE}
                  />
                  <p className="text-[16px] text-text">
                    Vendiste <span className="font-semibold tabular-nums">{Math.max(f.vendidas, 0)}</span>
                    {" · "}
                    <span className="font-semibold tabular-nums">{formatCentavos(f.subtotalCentavos)}</span>
                  </p>
                </div>
              );
            })}
          </div>
          <p className="border-t border-line pt-3 text-[17px] font-semibold text-text">
            Total vendido: <span className="tabular-nums">{formatCentavos(cierre.totalCentavos)}</span>
          </p>
        </SeccionForm>

        <SeccionForm titulo="¿Cuánta plata juntaste?" descripcion="Sirve para chequear que cuadre con lo vendido. Es solo informativo.">
          <MontoInput
            id="efectivo"
            label="Efectivo"
            value={efectivo}
            onChange={setEfectivo}
            placeholder="$ 0,00"
            simbolo={null}
            cajaClassName={CLASE_CAJA_MONTO}
            inputClassName={CLASE_INPUT_MONTO_GRANDE}
          />
          <MontoInput
            id="mercado-pago"
            label="Mercado Pago"
            value={mercadoPago}
            onChange={setMercadoPago}
            placeholder="$ 0,00"
            simbolo={null}
            cajaClassName={CLASE_CAJA_MONTO}
            inputClassName={CLASE_INPUT_MONTO_GRANDE}
          />
          <MontoInput
            id="banco"
            label="Banco"
            value={banco}
            onChange={setBanco}
            placeholder="$ 0,00"
            simbolo={null}
            cajaClassName={CLASE_CAJA_MONTO}
            inputClassName={CLASE_INPUT_MONTO_GRANDE}
          />
          {hayPlata && (
            <p className="text-[16px] font-medium text-text">
              {textoDiferencia(diferenciaPlata(cierre.totalCentavos, juntado))}
            </p>
          )}
        </SeccionForm>

        <MasDatos abierto={nota.trim() !== "" || (fecha !== "" && fecha !== hoyISO())}>
          <Campo id="fecha" etiqueta="Fecha">
            <Entrada
              type="date"
              required
              max={hoyISO()}
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="tabular-nums"
            />
          </Campo>
          <Campo id="nota" etiqueta="Nota" opcional>
            <AreaTexto value={nota} onChange={(event) => setNota(event.target.value)} rows={2} />
          </Campo>
        </MasDatos>

        {error && <MensajeError>{error}</MensajeError>}

        <AccionesForm etiqueta="Cerrar mi feria" cancelarHref="/mi/feria" fija />
      </form>

      <BottomSheet open={confirmando} ariaLabel="Confirmar el cierre de tu feria">
        <h2 className="font-display text-[24px] text-text">Cerrar mi feria</h2>
        <p className="mt-2 text-[16px] text-text-muted">
          Vas a registrar {totalVendidas} {envase(totalVendidas)} vendidas por{" "}
          {formatCentavos(cierre.totalCentavos)} y devolver {totalDevueltas}. ¿Confirmás?
        </p>
        <BotonAccion
          type="button"
          cargando={saving}
          textoCargando="Cerrando…"
          onClick={handleConfirmar}
          className={`${BOTON_PRIMARIO} mt-5 flex w-full px-4`}
        >
          Sí, cerrar
        </BotonAccion>
        <button
          type="button"
          disabled={saving}
          onClick={() => setConfirmando(false)}
          className={`${BOTON_SECUNDARIO} mt-3 flex w-full px-4`}
        >
          Revisar
        </button>
      </BottomSheet>
    </>
  );
}
