import { iniciales } from "@/lib/dominio/personas";

/** Círculo de 40px con las iniciales de la persona. */
export function Avatar({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line text-[14px] font-semibold text-text ${className}`}
    >
      {iniciales(nombre)}
    </span>
  );
}
