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
        <span className="truncate font-display text-[26px] leading-[1] text-primary">
          {nombre || formatPresentacion(presentacionMl)}
        </span>
        <span
          className={`text-[10px] tracking-[0.14em] whitespace-nowrap uppercase ${
            bajoUmbral ? "text-accent" : "text-text-muted"
          }`}
        >
          {bajoUmbral ? "Stock bajo" : `Mínimo ${umbralMinimo}`}
        </span>
      </div>
      <span
        className={`shrink-0 font-display text-[64px] leading-[0.85] tabular-nums md:text-[96px] ${
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
      className={`bg-surface-raised p-[18px] ${
        props.bajoUmbral ? "border-l-[3px] border-accent" : "border-l-[3px] border-secondary"
      }`}
    >
      <StockBadgeContent {...props} />
    </div>
  );
}
