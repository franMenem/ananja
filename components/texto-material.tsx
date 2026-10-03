import { parsearTexto } from "@/lib/dominio/texto-material";

/**
 * Renderizado de solo lectura de "Material de venta"
 *: mapea 1:1 los bloques de `parsearTexto` a HTML, sin
 * lógica propia. Reusado tal cual por la vista previa del admin
 * (`components/material/material-form.tsx`) y por la lectura del
 * revendedor (`/mi/material/[id]`). Si `cuerpo` no produce ningún bloque
 * (vacío o solo espacios), no renderiza nada — el caller decide qué
 * mostrar en ese caso (ver los dos usos).
 */
export function TextoMaterial({ cuerpo }: { cuerpo: string }) {
  const bloques = parsearTexto(cuerpo);

  return (
    <div className="flex flex-col gap-3">
      {bloques.map((bloque, index) => {
        if (bloque.tipo === "subtitulo") {
          return (
            <h2 key={index} className="font-display text-[19px] text-primary">
              {bloque.texto}
            </h2>
          );
        }
        if (bloque.tipo === "lista") {
          return (
            <ul key={index} className="list-disc pl-5 text-sm text-text">
              {bloque.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-sm text-text">
            {bloque.texto}
          </p>
        );
      })}
    </div>
  );
}
