import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { NEGOCIO } from "@/lib/negocio";

/**
 * `/login` — ingreso con email y contraseña, más "¿Olvidaste tu
 * contraseña?" (`LoginForm`). `?aviso=link` lo manda `/auth/confirm`
 * cuando un link de mail venció o ya se usó.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { aviso } = await searchParams;

  return (
    <AuthShell tagline={NEGOCIO.tagline}>
      <LoginForm aviso={typeof aviso === "string" ? aviso : null} />
    </AuthShell>
  );
}
