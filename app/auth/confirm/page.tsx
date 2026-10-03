import Link from "next/link";

import { confirmarLink } from "@/app/auth/confirm/actions";
import { AuthShell } from "@/components/auth-shell";
import { BotonEnviar } from "@/components/auth/boton-enviar";
import { esTipoOtp, textosConfirmacion } from "@/lib/dominio/invitaciones";
import { NEGOCIO } from "@/lib/negocio";

export const dynamic = "force-dynamic";

function param(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor : "";
}

/**
 * `/auth/confirm` — destino de TODOS los links de los mails de Supabase
 * Auth (plantillas en `supabase/templates/`):
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/bienvenida
 *
 * Abrir el link (GET) NO consume el token: solo muestra esta pantalla con
 * un botón "Continuar" que manda un POST (`confirmarLink`), y recién ahí
 * se verifica. Así un antivirus de mail que abre los links no quema la
 * invitación, y nadie puede iniciarle sesión a otro con un link embebido.
 *
 * El proxy deja pasar esta ruta sin ningún redirect (ver
 * `lib/supabase/middleware.ts` § `updateSession`): tiene que funcionar sin
 * sesión, y también con una sesión vieja de otra persona.
 */
export default async function ConfirmarPage({ searchParams }: PageProps<"/auth/confirm">) {
  const sp = await searchParams;
  const tokenHash = param(sp.token_hash);
  const tipoCrudo = param(sp.type);
  const code = param(sp.code);
  const next = param(sp.next);

  const tipo = esTipoOtp(tipoCrudo) ? tipoCrudo : null;
  const valido = (tokenHash !== "" && tipo !== null) || code !== "";

  if (!valido) {
    return (
      <AuthShell tagline={NEGOCIO.tagline}>
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-[30px] leading-[1.1] text-primary">Este link no es válido</h1>
          <p className="text-sm text-text-muted">
            Puede que esté incompleto. Abrilo de nuevo desde el mail, o pedí uno nuevo.
          </p>
          <Link
            href="/login"
            className="flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover"
          >
            Ir a ingresar
          </Link>
        </div>
      </AuthShell>
    );
  }

  const textos = textosConfirmacion(tipo);

  return (
    <AuthShell tagline={NEGOCIO.tagline}>
      <form action={confirmarLink} className="flex flex-col gap-5">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={tipoCrudo} />
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[30px] leading-[1.1] text-primary">{textos.titulo}</h1>
          <p className="text-sm text-text-muted">{textos.texto}</p>
        </div>

        <BotonEnviar texto={textos.boton} textoEnviando="Un momento…" />
      </form>
    </AuthShell>
  );
}
