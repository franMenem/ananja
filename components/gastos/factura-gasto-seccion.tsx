"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useEffect, useRef, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { IconReceipt } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { listarFacturasDeGastos } from "@/lib/data/gastos";
import { mensajeErrorFacturaGasto, type FacturaGasto } from "@/lib/dominio/gastos";
import { formatFecha } from "@/lib/fechas";
import { subirFotoCompra, validarFotoCompra } from "@/lib/foto-compra";
import { getSignedUrl, getSignedUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

type Vista = "ver" | "subir" | "elegir";

type FacturaGastoSeccionProps = {
  gastoId: string;
  imagenPath: string | null;
  /** Solo UI: la autorización real vive en las RPC
   * (`adjuntar_comprobante_gasto`/`quitar_comprobante_gasto`, ambas
   * `es_admin()`-only — ver `lib/sesion-actual.ts`). */
  isAdmin: boolean;
  /** El gasto ya cambió de factura (o se le quitó) — el caller actualiza
   * su copia local de `gasto.imagen_path`. */
  onCambiada: (imagenPath: string | null) => void;
};

/**
 * Sección "Factura" del detalle de un gasto (`/gastos/[id]`): ver la
 * factura ya subida (imagen inline o link a PDF, mismo patrón que
 * `/comprobantes/[id]`), subir una nueva/cambiarla, elegir una que ya se
 * subió para OTRO gasto (una misma factura puede cubrir varios — ej.
 * etiquetas grandes frente + retro) o quitarla (sin borrar el archivo:
 * puede estar compartido con otro gasto).
 */
export function FacturaGastoSeccion({
  gastoId,
  imagenPath,
  isAdmin,
  onCambiada,
}: FacturaGastoSeccionProps) {
  const [vista, setVista] = useState<Vista>("ver");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const [quitando, setQuitando] = useState(false);
  // El archivo ya se subió a Storage pero la RPC que guarda la referencia
  // falló — se conserva el path para poder reintentar SOLO la RPC, sin
  // volver a subir el archivo (eso dejaría un huérfano en el bucket, ver
  // comentario de cabecera de 0067_comprobante_en_gastos.sql).
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    // Sin `imagenPath` no hay nada que firmar — el render ya no usa
    // `signedUrl` en ese caso (muestra "Sin factura"), así que no hace
    // falta limpiarlo acá.
    if (!imagenPath) return;

    let cancelled = false;
    getSignedUrl(imagenPath).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [imagenPath]);

  async function adjuntar(path: string) {
    setGuardando(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("adjuntar_comprobante_gasto", {
      p_gasto_id: gastoId,
      p_imagen_path: path,
    });

    setGuardando(false);
    if (rpcError) {
      setError(mensajeErrorFacturaGasto(rpcError.message));
      // El archivo ya está en Storage: se guarda el path para reintentar
      // solo la RPC, no la subida.
      setPendingPath(path);
      return;
    }

    setPendingPath(null);
    onCambiada(path);
    setVista("ver");
  }

  /** Reintenta guardar la referencia (RPC) de un archivo que ya se subió,
   * sin volver a subirlo. */
  function reintentarAdjuntar() {
    if (pendingPath) void adjuntar(pendingPath);
  }

  async function handleQuitar() {
    setQuitando(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("quitar_comprobante_gasto", {
      p_gasto_id: gastoId,
    });

    setQuitando(false);
    if (rpcError) {
      setError(mensajeErrorFacturaGasto(rpcError.message));
      return;
    }

    setConfirmandoQuitar(false);
    onCambiada(null);
  }

  function cancelarSubvista() {
    setVista("ver");
    setError(null);
    setPendingPath(null);
  }

  const isPdf = imagenPath !== null && isPdfPath(imagenPath);

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] text-text-muted">
        Factura
      </span>

      {error && (
        <p role="alert" className="text-[14px] text-accent">
          {error}
        </p>
      )}

      {vista === "subir" && (
        pendingPath ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-[14px] text-text-muted">
              El archivo ya se subió. Falta guardarlo en el gasto — probá
              de nuevo, no hace falta volver a subirlo.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelarSubvista}
                disabled={guardando}
                className={`${BOTON_SECUNDARIO} flex-1 px-4`}
              >
                Cancelar
              </button>
              <BotonAccion
                cargando={guardando}
                textoCargando="Guardando…"
                type="button"
                onClick={reintentarAdjuntar}
                className={`${BOTON_PRIMARIO} flex-1 px-4`}
              >
                Reintentar
              </BotonAccion>
            </div>
          </div>
        ) : (
          <SubirFacturaGasto onSubida={adjuntar} onCancelar={cancelarSubvista} guardando={guardando} />
        )
      )}

      {vista === "elegir" && (
        <ElegirFacturaGasto onElegida={adjuntar} onCancelar={cancelarSubvista} guardando={guardando} />
      )}

      {vista === "ver" && (
        <>
          {!imagenPath ? (
            <div className="flex min-h-[100px] items-center justify-center border border-border bg-surface-raised p-4 text-[16px] text-text-muted rounded-2xl">
              Sin factura
            </div>
          ) : isPdf ? (
            <a
              href={signedUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-32 flex-col items-center justify-center gap-2.5 border border-border bg-surface-raised p-6 text-center rounded-2xl"
            >
              <IconReceipt className="h-9 w-9 text-text-muted" />
              <span className="text-[14px] font-medium text-primary">
                Ver PDF de la factura
              </span>
            </a>
          ) : signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt="Factura"
              className="max-h-[50vh] w-full border border-border object-contain"
            />
          ) : (
            <div className="flex min-h-32 items-center justify-center border border-border bg-surface-raised p-6 text-[16px] text-text-muted rounded-2xl">
              No se pudo cargar la imagen.
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-2">
              {!imagenPath ? (
                <>
                  <button
                    type="button"
                    onClick={() => setVista("subir")}
                    className="min-h-11 flex-1 border border-primary px-4 text-[16px] font-medium text-primary rounded-xl"
                  >
                    Subir factura
                  </button>
                  <button
                    type="button"
                    onClick={() => setVista("elegir")}
                    className="min-h-11 flex-1 border border-border px-4 text-[16px] font-medium text-text"
                  >
                    Usar una que ya subí
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVista("subir")}
                    className="min-h-11 flex-1 border border-primary px-4 text-[16px] font-medium text-primary rounded-xl"
                  >
                    Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoQuitar(true)}
                    className="min-h-11 flex-1 border border-accent px-4 text-[16px] font-medium text-accent rounded-xl"
                  >
                    Quitar
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      <BottomSheet open={confirmandoQuitar} ariaLabel="Quitar factura" variant="accent">
        <span className="text-[13px] text-accent">
          Quitar factura
        </span>
        <p className="font-display mt-2 text-[22px] leading-[1.3] text-primary">
          Se va a quitar la factura de este gasto.
        </p>
        <p className="mt-2 text-[14px] text-text-muted">
          El archivo no se borra: la factura sigue disponible para otros
          gastos que la compartan.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-[14px] text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmandoQuitar(false)}
            disabled={quitando}
            className={`${BOTON_SECUNDARIO} flex-1 px-4`}
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={quitando}
            textoCargando="Quitando…"
            type="button"
            onClick={handleQuitar}
            className="min-h-12 flex-1 bg-accent px-4 text-[16px] font-medium text-background disabled:opacity-45"
          >
            Quitar
          </BotonAccion>
        </div>
      </BottomSheet>
    </div>
  );
}

type SubirFacturaGastoProps = {
  onSubida: (path: string) => void;
  onCancelar: () => void;
  /** La subida ya terminó y está guardando la referencia vía RPC. */
  guardando: boolean;
};

/**
 * Elegir y subir un archivo nuevo — dos inputs separados (cámara / archivo)
 * por el mismo motivo que `components/comprobante-form/seccion-foto.tsx`:
 * `capture="environment"` en un único input fuerza la cámara en iOS Safari
 * y no deja elegir de la fototeca ni de Archivos.
 */
function SubirFacturaGasto({ onSubida, onCancelar, guardando }: SubirFacturaGastoProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFileRef = useRef<File | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function subir(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const path = await subirFotoCompra(file);
      setUploading(false);
      onSubida(path);
    } catch (err) {
      setUploading(false);
      setUploadError(
        err instanceof Error ? err.message : "No se pudo subir la foto. Probá de nuevo.",
      );
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validarFotoCompra(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    currentFileRef.current = file;
    setFileName(file.name);
    void subir(file);
  }

  function handleRetry() {
    if (currentFileRef.current) void subir(currentFileRef.current);
  }

  const disabled = uploading || guardando;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled}
          className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[13px] font-medium text-primary disabled:opacity-45"
        >
          Sacar foto
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[13px] font-medium text-primary disabled:opacity-45"
        >
          Subir archivo
        </button>
      </div>

      {/* `capture="environment"` abre la cámara directo — solo en este
          input, para no forzarla en iOS Safari en el de "Subir archivo". */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/heic,image/jpeg,image/png,image/webp,application/pdf,.heic,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {fileName && <p className="text-[13px] text-text-muted">{fileName}</p>}
      {uploading && <p className="text-[13px] text-text-muted">Subiendo factura…</p>}
      {!uploading && guardando && <p className="text-[13px] text-text-muted">Guardando…</p>}

      {uploadError && (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-[14px] text-accent">
            {uploadError}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="min-h-11 shrink-0 border border-border px-3 text-[14px] font-medium text-text"
          >
            Reintentar
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onCancelar}
        disabled={disabled}
        className={`${BOTON_SECUNDARIO} px-4`}
      >
        Cancelar
      </button>
    </div>
  );
}

type ElegirFacturaGastoProps = {
  onElegida: (path: string) => void;
  onCancelar: () => void;
  guardando: boolean;
};

/**
 * Lista de facturas ya subidas (`listarFacturasDeGastos`), para reusar la
 * misma en más de un gasto sin volver a subir el archivo. No excluye la
 * factura actual del gasto (si ya tenía una, elegirla de nuevo no rompe
 * nada) y viene ordenada por fecha desc.
 */
function ElegirFacturaGasto({ onElegida, onCancelar, guardando }: ElegirFacturaGastoProps) {
  const [facturas, setFacturas] = useState<FacturaGasto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const { data, error: fetchError } = await listarFacturasDeGastos(supabase);
      if (cancelled) return;

      if (fetchError) {
        setError(fetchError);
        setLoading(false);
        return;
      }

      setFacturas(data);
      setLoading(false);

      // Miniaturas en un solo batch (`getSignedUrls`) en vez de una signed
      // URL por factura.
      const paths = data.filter((f) => !isPdfPath(f.imagenPath)).map((f) => f.imagenPath);
      const urls = await getSignedUrls(paths);
      if (!cancelled) setThumbs(urls);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  function elegir(path: string) {
    setSeleccionada(path);
    onElegida(path);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {loading ? (
        <p className="py-4 text-[16px] text-text-muted">Cargando…</p>
      ) : error ? (
        <p role="alert" className="text-[16px] text-accent">
          {error}
        </p>
      ) : facturas.length === 0 ? (
        <p className="py-4 text-[16px] text-text-muted">
          Todavía no subiste ninguna factura para otro gasto.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-border bg-surface">
          {facturas.map((factura) => (
            <button
              key={factura.imagenPath}
              type="button"
              onClick={() => elegir(factura.imagenPath)}
              disabled={guardando}
              className="flex items-center gap-3 bg-surface px-3 py-2.5 text-left disabled:opacity-45"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-raised text-text-muted">
                {thumbs[factura.imagenPath] && !isPdfPath(factura.imagenPath) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[factura.imagenPath] ?? undefined}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconReceipt className="h-5 w-5" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[16px] text-text">
                  {factura.categoriaNombre ?? "Sin categoría"}
                </span>
                <span className="truncate text-[13px] text-text-muted">
                  {formatFecha(factura.fecha)} · usada en {factura.cantidadGastos} gasto
                  {factura.cantidadGastos === 1 ? "" : "s"}
                  {factura.nota ? ` · ${factura.nota}` : ""}
                </span>
              </span>
              {guardando && seleccionada === factura.imagenPath && <Spinner />}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onCancelar}
        disabled={guardando}
        className={`${BOTON_SECUNDARIO} px-4`}
      >
        Cancelar
      </button>
    </div>
  );
}
