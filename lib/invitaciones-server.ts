import "server-only";

import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { formatFechaHora } from "@/lib/fechas";
import {
  motivoNoCancelable,
  negocioDeUsuario,
  resolverUrlSitio,
  tipoPendiente,
  type InvitacionPendiente,
  type RolInvitacion,
} from "@/lib/dominio/invitaciones";
import { NEGOCIO } from "@/lib/negocio";
import { obtenerVendedorPorUserId, tieneAccesoValido, type VendedorConRol } from "@/lib/rol-vendedor";
import type { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Vendedor logueado SOLO si es un admin activo; si no, `null`. Primera
 * línea de toda server action / página que use la service role: la
 * sesión sale de las cookies (cliente normal, `getUser()` revalida el
 * token contra Supabase), nunca de algo que mande el navegador.
 */
export async function exigirAdmin(): Promise<VendedorConRol | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const vendedor = await obtenerVendedorPorUserId(supabase, user.id);
  if (!tieneAccesoValido(vendedor) || vendedor.rol !== "admin") return null;
  return vendedor;
}

/** Origen del sitio para los `redirectTo`: `NEXT_PUBLIC_SITE_URL`, o el
 * host de la request actual. */
export async function urlSitioServidor(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origen = host ? `${proto}://${host}` : null;
  return resolverUrlSitio(process.env.NEXT_PUBLIC_SITE_URL, origen) ?? "http://localhost:3000";
}

const POR_PAGINA = 200;
const MAX_PAGINAS = 50;

/** Todos los usuarios de Auth (paginado). El proyecto tiene pocas decenas
 * de usuarios; el tope evita un loop infinito si la API se comporta raro. */
async function listarTodosLosUsuarios(admin: AdminClient): Promise<User[]> {
  const todos: User[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    todos.push(...data.users);
    if (data.users.length < POR_PAGINA) break;
  }
  return todos;
}

/** Usuario de Auth con ese email (cualquier negocio), o `null`. */
export async function buscarUsuarioPorEmail(admin: AdminClient, email: string): Promise<User | null> {
  const usuarios = await listarTodosLosUsuarios(admin);
  const buscado = email.trim().toLowerCase();
  return usuarios.find((u) => u.email?.toLowerCase() === buscado) ?? null;
}

/** `true` si el usuario de Auth es de ESTE negocio (auth.users es
 * compartido con Germá). */
export function esDeEsteNegocio(user: Pick<User, "user_metadata">): boolean {
  return negocioDeUsuario(user.user_metadata) === NEGOCIO.id;
}

/**
 * Personas de este negocio que todavía no terminaron de entrar:
 * invitaciones por mail (nunca usaron el link, o lo usaron pero no
 * eligieron contraseña) y cuentas con contraseña temporal creadas desde
 * "Sumar persona" que nunca entraron (así se puede cancelar una creada por
 * error). Solo cuentan las que tienen fila activa en `vendedores` de este
 * schema.
 */
export async function listarInvitacionesPendientes(admin: AdminClient): Promise<InvitacionPendiente[]> {
  const usuarios = (await listarTodosLosUsuarios(admin)).filter(
    (u) => esDeEsteNegocio(u) && tipoPendiente(u) !== null,
  );
  if (usuarios.length === 0) return [];

  const { data: vendedores, error } = await admin
    .from("vendedores")
    .select("id, nombre, rol, user_id, activo")
    .in(
      "user_id",
      usuarios.map((u) => u.id),
    );
  if (error) throw error;

  const porUserId = new Map((vendedores ?? []).map((v) => [v.user_id, v]));

  const fechaAlta = (u: User) => u.invited_at ?? u.created_at ?? "";

  return usuarios
    .sort((a, b) => fechaAlta(b).localeCompare(fechaAlta(a)))
    .flatMap((u): InvitacionPendiente[] => {
      const v = porUserId.get(u.id);
      const tipo = tipoPendiente(u);
      if (!v || !v.activo || !tipo) return [];
      return [
        {
          userId: u.id,
          tipo,
          nombre: v.nombre,
          email: u.email ?? "",
          rol: v.rol,
          invitadaEn: fechaAlta(u) ? formatFechaHora(fechaAlta(u)) : "—",
          puedeCancelar: motivoNoCancelable(tipo, u) === null,
        },
      ];
    });
}

export function etiquetaRol(rol: string): string {
  const etiquetas: Record<RolInvitacion | "pendiente", string> = {
    revendedor: "Revendedora",
    admin: "Admin",
    coordinador: "Coordinador",
    pendiente: "Sin rol",
  };
  return etiquetas[rol as RolInvitacion | "pendiente"] ?? rol;
}
