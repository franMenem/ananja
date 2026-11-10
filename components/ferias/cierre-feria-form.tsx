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
import { useEnvio } from "@/components/ui/use-envio";

export type ProductoCierreForm = Omit<ProductoCierreFeria, "yaVendidas"> & {
  yaVendidas: number;
  /** Degustación que el admin ya le cargó (a cargo de Ananja). No se descuenta de lo que se llevó. */
  degustadasCarga?: number;
};

export function textoDiferenciaAdmin(diferenciaCentavos: number): string {
  if (diferenciaCentavos === 0) return "Cuadra justo";
  return diferenciaCentavos < 0
    ? `Faltan ${formatCentavos(-diferenciaCentavos)}`
    : `Sobran ${formatCentavos(diferenciaCentavos)}`;
}

function montoAProcesar(texto: string): number | null {
  return texto.trim() === "" ? 0 : parseMontoInput(texto);
}

/** Pantalla de confirmación previa a guardar (solo la usa la revendedora). */
export type ConfirmacionCierreFeria = {
  ariaLabel: string;
  titulo: string;
  resumen: (vendidas: number, totalCentavos: number, devueltas: number) => string;
  textoCargando: string;
  confirmar: string;
  revisar: string;
};

/** Todo lo que cambia de persona (segunda / tercera) entre las dos pantallas de cierre. */
export type TextosCierreFeria = {
  tituloHeader: string;
  backLabel: string;
  tituloProductos: string;
  /** Renglón del producto: "Te llevaste 10" / "Se llevó 10". */
  llevo: (n: number) => string;
  /** Sufijo " · ya vendiste 2" / " · ya vendió 2" (solo si ya vendió algo). */
  yaVendio: (n: number) => string;
  /** Sufijo " · ya tenés 3 para degustación"; sin esto no se muestra ni se renombra el stepper. */
  yaTieneDegustacion?: (n: number) => string;
  etiquetaDevuelve: string;
  ariaDevuelve: (nombre: string) => string;
  /** Total del producto: "Vendiste" / "Vendió". */
  etiquetaVendio: string;
  /** Mensaje cuando no hay productos cargados; null = no se muestra nada. */
  sinProductos: string | null;
  tituloPlata: string;
  diferencia: (diferenciaCentavos: number) => string;
  etiquetaBoton: string;
  /** Clases extra del `<form>`. */
  claseForm: string;
  /** null = guarda directo al enviar; con valor, pide confirmar antes. */
  confirmacion: ConfirmacionCierreFeria | null;
};

/** Textos de "Cerrar mi feria" (`/mi/feria/cerrar`): habla en segunda persona y pide confirmar. */
export const TEXTOS_CIERRE_FERIA_MI: TextosCierreFeria = {
  tituloHeader: "Cerrar mi feria",
  backLabel: "Volver a mi feria",
  tituloProductos: "¿Qué pasó con lo que te llevaste?",
  llevo: (n) => `Te llevaste ${n}`,
  yaVendio: (n) => ` · ya vendiste ${n}`,
  yaTieneDegustacion: (n) => ` · ya tenés ${n} para degustación`,
  etiquetaDevuelve: "Devolvés",
  ariaDevuelve: (nombre) => ` de ${nombre} que devolvés`,
  etiquetaVendio: "Vendiste",
  sinProductos: null,
  tituloPlata: "¿Cuánta plata juntaste?",
  diferencia: textoDiferencia,
  etiquetaBoton: "Cerrar mi feria",
  claseForm: "",
  confirmacion: {
    ariaLabel: "Confirmar el cierre de tu feria",
    titulo: "Cerrar mi feria",
    resumen: (vendidas, totalCentavos, devueltas) =>
      `Vas a registrar ${vendidas} ${envase(vendidas)} vendidas por ${formatCentavos(totalCentavos)} y devolver ${devueltas}. ¿Confirmás?`,
    textoCargando: "Cerrando…",
    confirmar: "Sí, cerrar",
    revisar: "Revisar",
  },
};

/** Textos del cierre que hace el admin (`/ferias/[id]/cerrar/[vendedorId]`): tercera persona, guarda directo. */
export function textosCierreFeriaAdmin(vendedorNombre: string): TextosCierreFeria {
  return {
    tituloHeader: `Cerrar la feria de ${vendedorNombre}`,
    backLabel: "Volver a la feria",
    tituloProductos: `¿Qué pasó con lo que se llevó ${vendedorNombre}?`,
    llevo: (n) => `Se llevó ${n}`,
    yaVendio: (n) => ` · ya vendió ${n}`,
    etiquetaDevuelve: "Devuelve",
    ariaDevuelve: (nombre) => ` de ${nombre} que devuelve`,
    etiquetaVendio: "Vendió",
    sinProductos: "Todavía no se le cargaron botellas.",
    tituloPlata: "¿Cuánta plata juntó?",
    diferencia: textoDiferenciaAdmin,
    etiquetaBoton: "Cerrar participación",
    claseForm: " pb-8",
    confirmacion: null,
  };
}

/**
 * Cierre de la participación en una feria, para la revendedora (`/mi/feria/cerrar`,
 * `vendedorId: null`) y para el admin (`/ferias/[id]/cerrar/[vendedorId]`). Por producto,
 * cuántas devuelve y cuántas usó para degustar; lo demás se considera vendido
 * (llevadas − ya vendidas − devueltas − degustadas) al precio de feria, que se puede
 * corregir. Abajo, cuánta plata juntó por medio (la diferencia con lo vendido es solo
 * informativa). Lo que cambia entre pantallas va en `textos`.
 */
export function CierreFeriaForm({
  feriaId,
  vendedorId,
  productos,
  volverHref,
  textos,
}: {
  feriaId: string;
  /** null = la propia revendedora; con id, el admin cerrando la de otra persona. */
  vendedorId: string | null;
  productos: ProductoCierreForm[];
  volverHref: string;
  textos: TextosCierreFeria;
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
  const envio = useEnvio();
  const saving = envio.ocupado;
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
    if (problema) return;
    if (textos.confirmacion) setConfirmando(true);
    else void guardar();
  }

  async function guardar() {
    if (!envio.empezar()) return;
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await feriaCerrarParticipacion(supabase, {
      feriaId,
      vendedorId,
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
      envio.liberar();
      return;
    }

    envio.completar();
    router.push(volverHref);
    router.refresh();
  }

  return (
    <>
      <SetFormHeader title={textos.tituloHeader} backHref={volverHref} backLabel={textos.backLabel} />

      <form onSubmit={handleSubmit} className={`flex flex-col gap-5${textos.claseForm}`}>
        <SeccionForm titulo={textos.tituloProductos}>
          {cierre.filas.length === 0 && textos.sinProductos && (
            <p className="text-[15px] text-text-muted">{textos.sinProductos}</p>
          )}
          <div className="flex flex-col gap-5 divide-y divide-line">
            {cierre.filas.map((f, i) => {
              const p = productos[i];
              const disponible = p.entregadas - p.yaVendidas;
              const conCarga = (p.degustadasCarga ?? 0) > 0 && textos.yaTieneDegustacion !== undefined;
              return (
                <div key={f.productoId} className="flex flex-col gap-3 pt-5 first:pt-0">
                  <div className="flex flex-col">
                    <span className="text-[17px] font-semibold text-text">{f.nombre}</span>
                    <span className="text-[14px] text-text-muted">
                      {textos.llevo(p.entregadas)}
                      {conCarga && textos.yaTieneDegustacion?.(p.degustadasCarga ?? 0)}
                      {p.yaVendidas > 0 && textos.yaVendio(p.yaVendidas)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <div>
                      <span className={CLASE_ETIQUETA}>{textos.etiquetaDevuelve}</span>
                      <div className="mt-1.5">
                        <CantidadStepper
                          size="sm"
                          value={f.devueltas}
                          onChange={(n) => setDevueltas((d) => ({ ...d, [f.productoId]: n }))}
                          min={0}
                          max={Math.max(disponible - f.degustadas, 0)}
                          ariaLabelSufijo={textos.ariaDevuelve(f.nombre)}
                        />
                      </div>
                    </div>
                    <div>
                      <span className={CLASE_ETIQUETA}>
                        {conCarga ? "Degustación extra" : "Degustación"}
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
                    {textos.etiquetaVendio} <span className="font-semibold tabular-nums">{Math.max(f.vendidas, 0)}</span>
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

        <SeccionForm titulo={textos.tituloPlata} descripcion="Sirve para chequear que cuadre con lo vendido. Es solo informativo.">
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
              {textos.diferencia(diferenciaPlata(cierre.totalCentavos, juntado))}
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

        <AccionesForm
          etiqueta={textos.etiquetaBoton}
          cargando={!textos.confirmacion && saving}
          cancelarHref={volverHref}
          fija
        />
      </form>

      {textos.confirmacion && (
        <BottomSheet open={confirmando} ariaLabel={textos.confirmacion.ariaLabel}>
          <h2 className="font-display text-[24px] text-text">{textos.confirmacion.titulo}</h2>
          <p className="mt-2 text-[16px] text-text-muted">
            {textos.confirmacion.resumen(totalVendidas, cierre.totalCentavos, totalDevueltas)}
          </p>
          <BotonAccion
            type="button"
            cargando={saving}
            textoCargando={textos.confirmacion.textoCargando}
            onClick={guardar}
            className={`${BOTON_PRIMARIO} mt-5 flex w-full px-4`}
          >
            {textos.confirmacion.confirmar}
          </BotonAccion>
          <button
            type="button"
            disabled={saving}
            onClick={() => setConfirmando(false)}
            className={`${BOTON_SECUNDARIO} mt-3 flex w-full px-4`}
          >
            {textos.confirmacion.revisar}
          </button>
        </BottomSheet>
      )}
    </>
  );
}
