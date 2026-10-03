/**
 * Instrucciones para agregar la app a la pantalla de inicio en Safari de
 * iOS/iPadOS — ahí no existe `beforeinstallprompt` (US-PWA), así que es la
 * única forma de ofrecer instalación. Compartido entre
 * `NotificacionesBanner` (aviso de "instalá la app para recibir avisos") e
 * `InstalarAppBanner` (aviso general "Cómo instalar").
 */
export function InstruccionesInstalarIOS({ proposito }: { proposito: string }) {
  return (
    <p className="text-[13px] leading-[1.55] text-text-muted">
      En Safari tocá <span className="font-medium text-text">Compartir</span>{" "}
      y después{" "}
      <span className="font-medium text-text">Agregar a inicio</span> para{" "}
      {proposito}.
    </p>
  );
}
