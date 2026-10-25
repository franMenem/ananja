/**
 * Presentación pura del stock de un producto: cifra grande en serif,
 * bordó (`accent`) cuando está bajo el umbral mínimo, oliva si está en
 * regla — con una marca de `border-left` de 3px en vez de un borde rojo
 * completo (design/handoff README § /stock). Sin lógica de fetch ni edición — se reusa
 * tanto en /stock (con edición, ver `StockCard`) como en el Home (solo
 * lectura), y funciona igual dentro de Server o Client Components porque
 * no depende de hooks ni de directivas.
 *
 * `StockBadgeContent` expone solo el contenido interno (sin el filete
 * izquierdo ni el fondo) para que `StockCard` pueda envolverlo junto con
 * el bloque editable de costo/umbral en un único filete continuo, sin
 * duplicar el borde.
 */

import { Pastilla } from "@/components/ui/pastilla";
import { formatPresentacion } from "@/lib/negocio";

type StockBadgeContentProps = {
  nombre: string;
  presentacionMl: number;
  stock: number;
  umbralMinimo: number;
  bajoUmbral: boolean;
};

export function StockBadgeContent({
  nombre,
  presentacionMl,
  stock,
  umbralMinimo,
  bajoUmbral,
}: StockBadgeContentProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-display text-[26px] leading-[1] text-text">
          {nombre || formatPresentacion(presentacionMl)}
        </span>
        {bajoUmbral ? (
          <Pastilla variante="aviso" className="w-fit">
            Stock bajo
          </Pastilla>
        ) : (
          <span className="text-[13px] whitespace-nowrap text-text-muted">{`Mínimo ${umbralMinimo}`}</span>
        )}
      </div>
      <span
        className={`shrink-0 font-display text-[40px] leading-[0.85] tabular-nums md:text-[40px] ${
          bajoUmbral ? "text-accent" : "text-primary"
        }`}
      >
        {stock}
      </span>
    </div>
  );
}

type StockBadgeProps = StockBadgeContentProps;

export function StockBadge(props: StockBadgeProps) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-[18px] ${
        props.bajoUmbral ? "border-l-[3px] border-accent" : "border-l-[3px] border-secondary"
      }`}
    >
      <StockBadgeContent {...props} />
    </div>
  );
}
