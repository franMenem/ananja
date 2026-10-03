"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CategoriaSelect } from "@/app/(app)/gastos/categoria-select";
import { BotonAccion } from "@/components/boton-accion";
import { IconExpense } from "@/components/icons";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { parseMontoInput } from "@/lib/money";
import { notificarPush } from "@/lib/push-client";
import { useVendedorActual } from "@/lib/vendedor-actual";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

// Subida del comprobante de gasto: reglas del contrato (contracts/database.md)
// — bucket privado (`BUCKET`, ver lib/negocio.ts § NEGOCIO.bucket), máx
// 10 MB, MIME imagen o PDF. Path propio (prefijo `gastos/`, ver
// subirFotoGasto) en vez de `lib/storage.ts § subirComprobante`, que guarda
// los comprobantes de venta sin ese prefijo.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
const EXTENSION_BY_MIME: Record<(typeof ALLOWED_MIME_TYPES)[number], string> =
  {
    "image/heic": "heic",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };

function extensionFor(file: File): string {
  const byMime =
    EXTENSION_BY_MIME[file.type as (typeof ALLOWED_MIME_TYPES)[number]];
  if (byMime) return byMime;
  const fromName = file.name.split(".").pop();
  return fromName ? fromName.toLowerCase() : "bin";
}

function validateFoto(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "El archivo supera el tamaño máximo permitido (10 MB).";
  }
  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number],
    )
  ) {
    return "Formato no soportado. Usá una foto (JPG, PNG, HEIC, WebP) o un PDF.";
  }
  return null;
}

/** Sube la foto del gasto a `comprobantes/gastos/AAAA/MM/<uuid>.<ext>`. */
async function subirFotoGasto(file: File): Promise<string> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = extensionFor(file);
  const path = `gastos/${year}/${month}/${crypto.randomUUID()}.${ext}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error("No se pudo subir la foto. Probá de nuevo.");
  }

  return path;
}

type GastoFormProps = {
  /** A dónde volver tras guardar. Default `/gastos`. */
  volverA?: string;
};

/**
 * Formulario de alta de un gasto — extraído de
 * `app/(app)/gastos/nuevo/page.tsx`, que solo dibuja el header y renderiza
 * este componente.
 *
 * Ya no se asigna a un lote de producción (0038): un gasto con `lote_id` y
 * sin `concepto_lote` suma al costo del lote además de su propia línea en
 * `lote_costos` — contaba dos veces. Los costos del pedido se cargan en
 * "Costos del pedido" y los pagos al proveedor desde "Registrar pago" del lote.
 */
export function GastoForm({ volverA }: GastoFormProps) {
  const router = useRouter();
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  // Dos inputs separados (cámara / archivo) por el mismo motivo que en
  // components/comprobante-form.tsx: `capture="environment"` en un único
  // input fuerza la cámara en iOS Safari y no deja elegir de la fototeca
  // ni de Archivos.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [monto, setMonto] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFotoError(null);
    if (!file) {
      setFoto(null);
      return;
    }
    const validationError = validateFoto(file);
    if (validationError) {
      setFotoError(validationError);
      setFoto(null);
      event.target.value = "";
      return;
    }
    setFoto(file);
  }

  async function handleSubmit(event: React.FormEvent) {
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
      let imagenPath: string | undefined;
      if (foto) {
        imagenPath = await subirFotoGasto(foto);
      }

      const supabase = createClient();
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "crear_gasto",
        {
          p_monto_centavos: montoCentavos,
          p_categoria_id: categoriaId,
          p_medio_pago: medioPago,
          p_fecha: fecha,
          p_nota: nota.trim() || undefined,
          p_imagen_path: imagenPath,
        },
      );

      if (rpcError) {
        setSaving(false);
        setError(mensajeErrorGasto(rpcError.message));
        return;
      }

      // Web Push (US5) tras el alta exitosa — best-effort, nunca bloquea.
      // El servidor arma el título/detalle reales a partir del `gasto_id`
      // (hardening del hallazgo #3 de la auditoría de seguridad).
      const gastoId = (rpcData as { gasto_id?: string } | null)?.gasto_id;
      if (gastoId) {
        void notificarPush("gasto_nuevo", gastoId);
      }

      router.push(volverA ?? "/gastos");
    } catch {
      // Falla de red (fetch/subida) u otro error inesperado: no se pierde
      // nada de lo ya cargado, el usuario puede reintentar.
      setSaving(false);
      setError(
        "No se pudo conectar. Verificá tu conexión e intentá de nuevo — no perdiste los datos cargados.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <MontoInput
        id="monto"
        label="Monto"
        value={monto}
        onChange={setMonto}
        required
        placeholder="0,00"
        labelClassName="text-[10px] tracking-[0.22em] text-text-muted uppercase"
        cajaClassName="mt-1 flex items-baseline gap-2 border-b-2 border-primary pb-1"
        simboloClassName="font-display text-[22px] text-text-muted"
        inputClassName="font-display w-full min-w-0 bg-transparent text-[42px] text-primary tabular-nums"
      />

      <CategoriaSelect value={categoriaId} onChange={setCategoriaId} />

      <MedioPagoChips value={medioPago} onChange={setMedioPago} />

      {!vendedorLoading && vendedor && (
        <p className="text-xs text-text-muted">
          Registrando como{" "}
          <span className="font-medium">{vendedor.nombre}</span>
        </p>
      )}
      {!vendedorLoading && !vendedor && (
        <p role="alert" className="text-xs text-accent">
          Tu usuario no está vinculado a un vendedor. Pedile al dueño que
          te dé de alta desde el dashboard de Supabase.
        </p>
      )}

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

      <div>
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Foto (opcional)
        </span>
        <div className="mt-1.5 flex min-h-[150px] flex-col items-center justify-center gap-2 border border-border bg-surface-raised px-4 text-center">
          <IconExpense className="h-[30px] w-[30px] text-text-muted" />
          <span className="text-[12px] tracking-[0.1em] text-text-muted uppercase">
            {foto ? foto.name : "Ningún comprobante elegido"}
          </span>
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-px bg-border">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[11px] font-medium tracking-[0.12em] text-primary uppercase"
          >
            Sacar foto
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[11px] font-medium tracking-[0.12em] text-primary uppercase"
          >
            Subir archivo
          </button>
        </div>

        {/* `capture="environment"` abre la cámara directo — solo en este
            input. El de "Subir archivo" no lo lleva para no forzar la
            cámara en iOS Safari. */}
        <input
          ref={cameraInputRef}
          id="foto-camara"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFotoChange}
          className="sr-only"
        />
        <input
          ref={fileInputRef}
          id="foto-archivo"
          type="file"
          accept="image/heic,image/jpeg,image/png,image/webp,application/pdf,.heic,.pdf"
          onChange={handleFotoChange}
          className="sr-only"
        />
        {fotoError && (
          <p role="alert" className="mt-1 text-sm text-accent">
            {fotoError}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-accent">
          {error}
        </p>
      )}

      <BotonAccion
        cargando={saving}
        textoCargando="Guardando…"
        type="submit"
        className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        {error ? "Reintentar" : "Guardar gasto"}
      </BotonAccion>
    </form>
  );
}

const ERRORES: Record<string, string> = {
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
};

function mensajeErrorGasto(codigo: string | undefined): string {
  return traducirErrorRpc(codigo, ERRORES, "No pudimos guardar el gasto. Revisá los datos e intentá de nuevo.");
}
