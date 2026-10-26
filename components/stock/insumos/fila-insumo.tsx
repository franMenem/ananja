import Link from "next/link";

import { Fila } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { formatNumeroInsumo } from "@/lib/dominio/insumos";
import type { AlcancePresentacion } from "@/lib/dominio/botellas";
import { formatPresentacion } from "@/lib/negocio";

/** "12 litros", "1 litro", "3 kilos", "30 unidades" (con el número formateado). */
export function textoCantidadInsumo(cantidad: number, unidad: string): string {
  const numero = formatNumeroInsumo(cantidad);
  const uno = cantidad === 1;
  if (unidad === "litro") return `${numero} ${uno ? "litro" : "litros"}`;
  if (unidad === "kilo") return `${numero} ${uno ? "kilo" : "kilos"}`;
  return `${numero} ${uno ? "unidad" : "unidades"}`;
}

/** "alcanza para 24 × 500 ml / 40 × 250 ml". */
export function textoAlcance(alcance: AlcancePresentacion[]): string {
  return `alcanza para ${alcance.map((a) => `${a.unidades} × ${formatPresentacion(a.presentacionMl)}`).join(" / ")}`;
}

/**
 * Un insumo en la lista: nombre, cuánto hay (y, para la materia prima, para
 * cuántas botellas alcanza) y una pastilla ámbar si queda poco o no queda nada.
 */
export function FilaInsumo({
  id,
  nombre,
  stock,
  unidad,
  bajoUmbral,
  alcance,
}: {
  id: string;
  nombre: string;
  stock: number;
  unidad: string;
  bajoUmbral: boolean;
  alcance?: AlcancePresentacion[];
}) {
  // Sin stock es un caso distinto de "bajo el mínimo": con umbral 0 (insumos
  // recién dados de alta), `bajo_umbral` nunca es true aunque el stock sea 0.
  const sinStock = stock <= 0;
  const detalle = `${textoCantidadInsumo(stock, unidad)}${alcance && alcance.length > 0 && !sinStock ? ` · ${textoAlcance(alcance)}` : ""}`;
  return (
    <Link prefetch={false} href={`/stock/insumos/${id}`} className="block rounded-lg hover:bg-background">
      <Fila
        titulo={nombre}
        detalle={detalle}
        valor={
          sinStock ? (
            <Pastilla variante="aviso">Sin stock</Pastilla>
          ) : bajoUmbral ? (
            <Pastilla variante="aviso">Queda poco</Pastilla>
          ) : undefined
        }
      />
    </Link>
  );
}
