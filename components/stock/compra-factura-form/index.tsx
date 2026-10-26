"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { AccionesForm } from "@/components/ui/acciones-form";
import { Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
import { listarInsumosActivos } from "@/lib/data/insumos";
import { calcularFacturaInsumos, evaluarLineaFactura } from "@/lib/dominio/factura-insumos";
import { hoyISO } from "@/lib/fechas";
import type { Insumo } from "@/lib/dominio/insumos";
import { subirFotoCompra } from "@/lib/foto-compra";
import { registrarCompraFactura } from "@/lib/insumos";
import { formatCentavos, parseMontoInput, parsePorcentaje } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { useVendedorActual } from "@/lib/vendedor-actual";

import { FotoFacturaCampos } from "@/components/stock/compra-factura-form/foto-factura";
import { LineaFacturaCampos } from "@/components/stock/compra-factura-form/linea-factura";
import { RevisionFactura } from "@/components/stock/compra-factura-form/revision-factura";
import {
  mensajeErrorFactura,
  type LineaEditable,
  type LineaValida,
  type MedioPago,
} from "@/components/stock/compra-factura-form/tipos";

type CompraFacturaFormProps = {
  /** Con `?insumo=<id>` (link "Sin stock — registrá la compra" de
   * `/stock/insumos`, tanda produccion-simple) preselecciona ese insumo en
   * la primera línea — se ignora en silencio un id que no exista o esté
   * inactivo (valida contra `listarInsumosActivos`, mismo criterio que
   * tenía `CompraInsumoForm`). */
  insumoInicial?: string;
};

/**
 * Formulario "Cargar compra" (`/stock/insumos/factura`, tanda
 * produccion-simple — antes "Cargar factura"): una factura con varias
 * líneas de insumos (ej. etiquetas de 250 y 500 ml de la imprenta), IVA y
 * un envío pagado aparte, o una compra suelta de un solo renglón (sin
 * envío, sin IVA extra si se destilda "Los precios de la factura son sin
 * IVA"). Muestra en vivo cuánto cuesta de verdad cada línea
 * (`calcularFacturaInsumos`, espejo del RPC) y al confirmar llama
 * `registrar_compra_insumos_factura`: un gasto en Insumos + un ingreso de
 * stock por línea, todo junto o nada.
 *
 * Partido en bloques por concepto (un archivo por concepto en este
 * directorio): `linea-factura.tsx` (una línea de la factura),
 * `foto-factura.tsx` (sacar/subir el comprobante) y `revision-factura.tsx`
 * (la cuenta en vivo antes de confirmar). Este componente sigue siendo el
 * único dueño del estado — a diferencia de `CostosLoteCampos`, no lo
 * reusa ninguna otra pantalla.
 */
export function CompraFacturaForm({ insumoInicial }: CompraFacturaFormProps) {
  const router = useRouter();
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  const siguienteKey = useRef(2);

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [insumosLoading, setInsumosLoading] = useState(true);
  const [insumosError, setInsumosError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [preciosSinIva, setPreciosSinIva] = useState(true);
  const [ivaPct, setIvaPct] = useState("21");
  const [envio, setEnvio] = useState("");
  const [lineas, setLineas] = useState<LineaEditable[]>([
    { key: 1, insumoId: "", cantidad: "", precio: "" },
  ]);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listarInsumosActivos(createClient()).then(({ data, error: listarError }) => {
      if (cancelled) return;
      setInsumos(data);
      setInsumosError(listarError);
      setInsumosLoading(false);
      if (insumoInicial && data.some((insumo) => insumo.id === insumoInicial)) {
        setLineas((prev) =>
          prev.length === 1 && !prev[0].insumoId
            ? [{ ...prev[0], insumoId: insumoInicial }]
            : prev,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [insumoInicial]);

  const insumosPorId = useMemo(
    () => Object.fromEntries(insumos.map((i) => [i.id, i])),
    [insumos],
  );

  const ivaPctNum = preciosSinIva ? parsePorcentaje(ivaPct) : 0;
  const ivaValido = ivaPctNum !== null && ivaPctNum <= 100;
  const envioCentavos = envio.trim() === "" ? 0 : parseMontoInput(envio);
  const envioValido = envioCentavos !== null && envioCentavos >= 0;

  // Estado de cada línea (errores por campo incluidos) y las completas y
  // válidas, en el orden de la factura. La revisión en vivo usa solo las
  // válidas y avisa cuáles quedaron afuera; guardar exige que TODAS lo sean.
  const estadosLineas = useMemo(() => lineas.map((l) => evaluarLineaFactura(l)), [lineas]);
  const lineasValidas: LineaValida[] = useMemo(
    () => estadosLineas.flatMap((e) => (e.linea ? [e.linea] : [])),
    [estadosLineas],
  );
  const numerosLineasFuera = estadosLineas.flatMap((e, i) => (e.linea ? [] : [i + 1]));
  const hayLineasConError = estadosLineas.some((e) => e.errorCantidad || e.errorPrecio);

  const calculo = useMemo(() => {
    if (lineasValidas.length === 0 || !ivaValido || !envioValido) return null;
    return calcularFacturaInsumos({
      lineas: lineasValidas,
      preciosSinIva,
      ivaPct: ivaPctNum ?? 0,
      envioCentavos: envioCentavos ?? 0,
    });
  }, [lineasValidas, preciosSinIva, ivaPctNum, ivaValido, envioCentavos, envioValido]);

  const hayLineasIncompletas = numerosLineasFuera.length > 0;

  function actualizarLinea(key: number, cambios: Partial<Omit<LineaEditable, "key">>) {
    setError(null);
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    const key = siguienteKey.current;
    siguienteKey.current += 1;
    setLineas((prev) => [...prev, { key, insumoId: "", cantidad: "", precio: "" }]);
  }

  function quitarLinea(key: number) {
    setError(null);
    setLineas((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!fecha) {
      setError("Ingresá la fecha de la factura.");
      return;
    }
    if (!medioPago) {
      setError("Elegí un medio de pago.");
      return;
    }
    if (lineas.some((l) => !l.insumoId)) {
      setError("Elegí el insumo de cada línea.");
      return;
    }
    const ids = lineas.map((l) => l.insumoId);
    if (new Set(ids).size !== ids.length) {
      setError("Hay un insumo repetido en dos líneas. Juntalas en una sola.");
      return;
    }
    const indiceConProblema = estadosLineas.findIndex((e) => e.linea === null);
    if (indiceConProblema >= 0) {
      const estado = estadosLineas[indiceConProblema];
      const detalle =
        estado.errorCantidad ?? estado.errorPrecio ?? "completá la cantidad y el precio unitario.";
      setError(`Revisá la línea ${indiceConProblema + 1}: ${detalle}`);
      return;
    }
    if (!ivaValido) {
      setError("Revisá el porcentaje de IVA.");
      return;
    }
    if (!envioValido) {
      setError("Revisá el monto del envío.");
      return;
    }
    if (!calculo) return;

    setSaving(true);
    try {
      let imagenPath: string | null = null;
      if (foto) {
        imagenPath = await subirFotoCompra(foto);
      }

      const { error: rpcError } = await registrarCompraFactura(createClient(), {
        fecha,
        medioPago,
        lineas: lineasValidas,
        preciosSinIva,
        ivaPct: ivaPctNum ?? 0,
        envioCentavos: envioCentavos ?? 0,
        nota: nota.trim() || null,
        imagenPath,
        totalEsperadoCentavos: calculo.totalPagadoCentavos,
      });

      if (rpcError) {
        setSaving(false);
        setError(mensajeErrorFactura(rpcError.message));
        return;
      }

      router.push("/stock/insumos");
      router.refresh();
    } catch {
      setSaving(false);
      setError(
        "No se pudo conectar. Verificá tu conexión e intentá de nuevo — no perdiste los datos cargados.",
      );
    }
  }

  const nombresRevision = lineasValidas.map((l) => insumosPorId[l.insumoId]?.nombre ?? "Insumo");
  const unidadesRevision = lineasValidas.map((l) => insumosPorId[l.insumoId]?.unidad ?? "unidad");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SeccionForm titulo="La factura">
        <Campo id="factura-fecha" etiqueta="Fecha de la factura">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            className="tabular-nums"
          />
        </Campo>

        <MedioPagoChips value={medioPago} onChange={setMedioPago} />
      </SeccionForm>

      <SeccionForm
        titulo="Lo que compraste"
        descripcion="Cargá cada línea con el precio unitario tal cual figura en la factura."
      >
        {insumosError && <MensajeError>{insumosError}</MensajeError>}

        {lineas.map((linea, indice) => (
          <LineaFacturaCampos
            key={linea.key}
            linea={linea}
            indice={indice}
            estado={estadosLineas[indice]}
            insumo={insumosPorId[linea.insumoId]}
            insumos={insumos}
            insumosLoading={insumosLoading}
            mostrarQuitar={lineas.length > 1}
            onCambiar={(cambios) => actualizarLinea(linea.key, cambios)}
            onQuitar={() => quitarLinea(linea.key)}
          />
        ))}

        <button
          type="button"
          onClick={agregarLinea}
          className="min-h-12 rounded-xl border border-dashed border-primary px-4 text-[15px] font-semibold text-primary"
        >
          + Agregar otra línea
        </button>
      </SeccionForm>

      <SeccionForm
        titulo="IVA y envío"
        descripcion="El IVA (Ananja no lo recupera, es costo) y el envío se suman al costo de cada insumo. El envío se reparte según las unidades de cada línea."
      >
        <label className="flex min-h-11 items-center gap-3 text-[16px] text-text">
          <input
            type="checkbox"
            checked={preciosSinIva}
            onChange={(event) => setPreciosSinIva(event.target.checked)}
            className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
          />
          Los precios de la factura son sin IVA
        </label>
        {preciosSinIva && (
          <MontoInput id="factura-iva" tipo="porcentaje" label="IVA %" value={ivaPct} onChange={setIvaPct} />
        )}

        <MontoInput
          id="factura-envio"
          label="Envío total (opcional, sin IVA)"
          value={envio}
          onChange={setEnvio}
          placeholder="0,00"
          hint="Lo que pagaste por el envío de esta factura."
        />
      </SeccionForm>

      <MasDatos abierto={nota.trim() !== "" || foto !== null || fotoError !== null}>
        <Campo id="factura-nota" etiqueta="Proveedor / nota" opcional>
          <Entrada
            type="text"
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            placeholder="Ej. Imprenta Ejemplo S.A. — factura 0003-00012345"
          />
        </Campo>

        <FotoFacturaCampos
          foto={foto}
          error={fotoError}
          onChange={(nuevoFoto, nuevoError) => {
            setFoto(nuevoFoto);
            setFotoError(nuevoError);
          }}
        />
      </MasDatos>

      <div aria-live="polite">
        <SeccionForm titulo="Revisá la factura">
          {hayLineasIncompletas && (calculo || hayLineasConError) && (
            <p className="text-[14px] leading-snug text-accent">
              {numerosLineasFuera.length === 1
                ? `La línea ${numerosLineasFuera[0]} está incompleta o tiene un error: no está en la cuenta de abajo.`
                : `Las líneas ${numerosLineasFuera.slice(0, -1).join(", ")} y ${numerosLineasFuera.at(-1)} están incompletas o tienen errores: no están en la cuenta de abajo.`}
            </p>
          )}
          {calculo ? (
            <RevisionFactura
              calculo={calculo}
              nombres={nombresRevision}
              unidades={unidadesRevision}
              preciosSinIva={preciosSinIva}
              ivaPct={ivaPctNum ?? 0}
            />
          ) : (
            <p className="text-[14px] leading-snug text-text-muted">
              {!ivaValido
                ? "Revisá el porcentaje de IVA para ver la cuenta."
                : !envioValido
                  ? "Revisá el monto del envío para ver la cuenta."
                  : "Completá al menos una línea (insumo, cantidad y precio) para ver la cuenta."}
            </p>
          )}
        </SeccionForm>
      </div>

      {!vendedorLoading && vendedor && (
        <p className="text-[14px] text-text-muted">
          Registrando como <span className="font-semibold text-text">{vendedor.nombre}</span>
        </p>
      )}
      {!vendedorLoading && !vendedor && (
        <MensajeError>
          Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta desde el
          dashboard de Supabase.
        </MensajeError>
      )}

      {error && <MensajeError>{error}</MensajeError>}

      <AccionesForm
        etiqueta={
          calculo ? `Confirmar compra · ${formatCentavos(calculo.totalPagadoCentavos)}` : "Confirmar compra"
        }
        cargando={saving}
        disabled={!calculo}
        cancelarHref="/stock/insumos"
        fija
      />
    </form>
  );
}
