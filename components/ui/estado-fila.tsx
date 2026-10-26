import Link from "next/link";
import type { ReactNode } from "react";

/** Chevron de una fila tocable. */
export function ChevronFila() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-text-muted"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Fila de lista entera tocable (un `<Link>`): contenido a la izquierda,
 * estado a la derecha, 56px de alto como mínimo. */
export function FilaLink({
  href,
  izquierda,
  derecha,
  className = "",
}: {
  href: string;
  izquierda: ReactNode;
  derecha?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-background ${className}`}
    >
      {izquierda}
      {derecha !== undefined && derecha !== null && <div className="ml-auto flex shrink-0 items-center gap-2">{derecha}</div>}
    </Link>
  );
}
