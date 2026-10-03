import { IconReceipt } from "@/components/icons";

/**
 * Miniatura cuadrada de un comprobante: la foto si hay y se pudo firmar; si
 * no (PDF, sin foto, URL que no se pudo firmar), un ícono de recibo. La
 * comparten la lista de ventas y la de pagos de revendedores.
 */
export function MiniaturaComprobante({
  tieneImagen,
  isPdf,
  signedUrl,
  size,
}: {
  tieneImagen: boolean;
  isPdf: boolean;
  signedUrl: string | null;
  size: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-[52px] w-[52px]" : "h-14 w-14";
  const iconDims = size === "sm" ? "h-[19px] w-[19px]" : "h-5 w-5";
  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-raised text-text-muted`}
    >
      {tieneImagen && !isPdf && signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <IconReceipt className={iconDims} />
      )}
    </div>
  );
}
