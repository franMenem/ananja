import Link from "next/link";

import { Tarjeta } from "@/components/ui/tarjeta";
import type { AlcancePresentacion } from "@/lib/dominio/botellas";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion, NEGOCIO } from "@/lib/negocio";

function textoAlcance(alcance: AlcancePresentacion[]): string {
  return alcance.map((a) => `${a.unidades} × ${formatPresentacion(a.presentacionMl)}`).join(" / ");
}

/** "Aceite 12 L · alcanza para 24 × 500 ml · valor $X". Sin cargar nada, pide cargar la compra. */
export function LineaInsumo({
  nombre,
  cantidadTexto,
  alcance,
  valorCentavos,
  sinCargar,
}: {
  nombre: string;
  /** Ej. "12 L". `null` si todavía no hay stock cargado. */
  cantidadTexto: string | null;
  alcance: AlcancePresentacion[];
  valorCentavos?: number | null;
  sinCargar: string;
}) {
  if (cantidadTexto === null) {
    return (
      <Link prefetch={false} href="/stock/insumos/factura" className="text-[16px] text-text-muted underline decoration-[#d0cec8] underline-offset-4">
        {sinCargar}
      </Link>
    );
  }
  return (
    <p className="text-[16px] leading-snug text-text">
      {nombre} <span className="font-semibold tabular-nums">{cantidadTexto}</span>
      {alcance.length > 0 && <span className="block text-[14px] text-text-muted">alcanza para {textoAlcance(alcance)}</span>}
      {valorCentavos != null && (
        <span className="block text-[14px] text-text-muted">valor {formatCentavos(valorCentavos)}</span>
      )}
    </p>
  );
}

/** Resumen de insumos de `/stock`: lo que queda en el proveedor y para cuánto alcanza. */
export function ParaProducir({
  proveedorEn,
  aceiteLitros,
  alcanceAceite,
  aceiteValorCentavos,
  etiquetasRestantes,
  alcanceEtiqueta,
}: {
  proveedorEn: string;
  aceiteLitros: number;
  alcanceAceite: AlcancePresentacion[];
  aceiteValorCentavos: number | null;
  etiquetasRestantes: number;
  alcanceEtiqueta: AlcancePresentacion[];
}) {
  const nombreMateria = NEGOCIO.materiaPrima.nombre;
  return (
    <Tarjeta como="section" aria-labelledby="botellas-producir" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="botellas-producir" className="text-[20px] leading-tight font-semibold text-text">
          Para producir
        </h2>
        <p className="text-[14px] text-text-muted">Lo que queda {proveedorEn}</p>
      </div>
      <div className="flex flex-col gap-3">
        <LineaInsumo
          nombre={nombreMateria[0].toUpperCase() + nombreMateria.slice(1)}
          cantidadTexto={aceiteLitros > 0 ? `${aceiteLitros} L` : null}
          alcance={alcanceAceite}
          valorCentavos={aceiteValorCentavos}
          sinCargar={`Cargá la compra de ${nombreMateria} para ver cuánto queda`}
        />
        <LineaInsumo
          nombre="Etiquetas"
          cantidadTexto={etiquetasRestantes > 0 ? String(etiquetasRestantes) : null}
          alcance={alcanceEtiqueta}
          sinCargar="Cargá la compra de etiquetas para ver cuánto queda"
        />
      </div>
      <Link
        prefetch={false}
        href="/stock/insumos"
        className="inline-flex min-h-11 w-fit items-center text-[16px] font-semibold text-primary underline decoration-mark underline-offset-4"
      >
        Ver insumos
      </Link>
    </Tarjeta>
  );
}
