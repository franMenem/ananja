import { FilaTarea } from "@/components/tareas/fila-tarea";
import type { MedioPago } from "@/lib/dominio/caja";
import type { Tarea } from "@/lib/dominio/tareas";

type ListaTareasProps = {
  tareas: Tarea[];
  /** Cuenta preseleccionada en "Pasar a la cuenta". */
  medioDeposito: MedioPago;
};

/**
 * Lista de tareas (sin grupos) con separadores finos: cada una es una
 * `FilaTarea`. No trae tarjeta propia — la pone quien la usa (Hoy dentro de
 * "Para hacer", `/tareas` en su propia `Tarjeta`).
 */
export function ListaTareas({ tareas, medioDeposito }: ListaTareasProps) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {tareas.map((tarea) => (
        <FilaTarea key={tarea.id} tarea={tarea} medioDeposito={medioDeposito} />
      ))}
    </ul>
  );
}
