-- Ananja: comprobante de transferencia en "avisé que la pasé" de un coordinador.
--
-- Por qué: una coordinadora recibe los pagos de sus revendedoras y después le
-- pasa la plata a la cuenta de Ananja. Desde 0057 puede AVISAR que la pasó
-- (`informar_deposito_cuenta`, queda pendiente hasta que un admin lo confirma
-- desde Tareas), pero sin ninguna prueba: el admin confirma a ciegas, o tiene
-- que ir a mirar la app del banco / Mercado Pago a buscar la transferencia.
-- Las revendedoras ya adjuntan el comprobante cuando avisan un pago
-- (`informar_pago_revendedor`, 0040/0055); esto le da lo mismo a la
-- coordinadora, y deja el archivo visible para el admin al confirmar y
-- después en el movimiento de "En manos de X" / lista general de Plata.
--
-- Qué toca:
--
--  1) `depositos_informados.imagen_path text` (nullable) — el path del
--     comprobante dentro del bucket privado de Storage. Nullable porque los
--     avisos que ya existen no tienen comprobante (y no se inventa uno).
--
--  2) `informar_deposito_cuenta` — cambia la FIRMA: los 4 parámetros de 0057
--     en el mismo orden (`p_medio_pago`, `p_monto_centavos`, `p_fecha`,
--     `p_nota`) + un quinto, `p_imagen_path text default null`. Por regla del
--     proyecto una firma nueva se hace con `drop function` de la firma vieja
--     exacta + `create function`, NUNCA con `create or replace`: con
--     `create or replace` y una lista de parámetros distinta Postgres no
--     reemplaza, CREA una sobrecarga nueva, y PostgREST queda con dos
--     candidatas ambiguas para el mismo `rpc()`. El cuerpo es el de 0057
--     textual (verificado: ninguna migración posterior la redefine — 0058 y
--     0064 solo la nombran en comentarios) con los mismos chequeos, los mismos
--     errores (`NO_AUTORIZADO`, `MEDIO_INVALIDO`, `MONTO_INVALIDO`,
--     `FECHA_INVALIDA`, `AVISO_PENDIENTE`, `SALDO_INSUFICIENTE`), la misma
--     notificación a los admins y los mismos grants/revokes; lo único nuevo
--     es el manejo de `p_imagen_path`:
--       - `null` o vacío (después de `btrim`) = sin comprobante, se guarda
--         `null`;
--       - si viene, tiene que empezar con `coordinadores/<mi_vendedor_id>/`
--         (la carpeta propia de quien llama, nunca la de otra persona), no
--         contener `..` y no empezar con `/`; si no, `COMPROBANTE_INVALIDO`.
--     Es la misma validación que `informar_pago_revendedor` (0055) hace con
--     `revendedores/<mi_vendedor_id>/`.
--
--  3) Dos policies nuevas sobre `storage.objects` (insert y select) para que
--     una coordinadora pueda subir y volver a leer comprobantes SOLO dentro de
--     `coordinadores/<su vendedor_id>/`. Hoy una coordinadora no puede
--     subir ni leer nada: no es admin (policies `storage_*___SCHEMA__` de
--     0013, gateadas por `es_vendedor()` = `es_admin()`) ni
--     `puede_revender()` (policies `storage_*_revendedor_*` de 0040). Las
--     policies existentes NO se tocan.
--
-- El comprobante es OPCIONAL a nivel base (`p_imagen_path default null`, sin
-- `not null` en la columna) A PROPÓSITO: entre el momento en que se aplica
-- esta migración y el momento en que el deploy nuevo de la app queda en vivo
-- (o si alguien tiene la pantalla vieja abierta), un cliente viejo sigue
-- llamando a `informar_deposito_cuenta` con 4 argumentos. Como el quinto
-- tiene default, esa llamada sigue resolviendo a la función nueva y sigue
-- funcionando. La obligatoriedad la pone la UI
-- (`components/mi/informar-deposito-coordinador.tsx`: "Adjuntá el comprobante
-- de la transferencia."), no la base — así no hay una ventana en la que el
-- botón "Avisé que la pasé" quede roto para la coordinadora.
--
-- No se toca `depositos_cuenta`, ni `registrar_deposito_cuenta`, ni
-- `confirmar_deposito_informado` (0057): el depósito real que se crea al
-- confirmar es el mismo de siempre. El comprobante del depósito confirmado se
-- resuelve leyendo `depositos_informados` por `deposito_id` (el admin ya
-- tiene select sobre esa tabla por `depositos_informados_select`, 0057).
--
-- Policies de Storage: se usa el MISMO molde que las de revendedora de 0040
-- (`@solo-public` + placeholders `__SCHEMA__`/`__BUCKET__`), no un hardcode:
--  - los placeholders hacen que el nombre de cada policy lleve el schema
--    (`storage_insert_coordinador_public`, `storage_select_coordinador_public`)
--    y que `bucket_id` apunte al bucket del negocio, sin colisión de nombres
--    si algún día se renderiza para otro negocio — que además comparte el
--    mismo `storage.objects`;
--  - el bloque `@solo-public` las deja solo para Ananja, igual que las de
--    revendedora: el flujo de coordinadores y su carpeta
--    `coordinadores/<id>/` es hoy solo de Ananja (Germá/`miel` está en pausa
--    y no tiene coordinadores). Para `miel` el render omite el bloque entero.
-- El resto de la migración (columna y función) hardcodea `public.` y
-- `set search_path = public`, mismo criterio que 0049-0070. El `search_path`
-- va SIN comillas a propósito: `supabase/render.mjs` solo reescribe la
-- palabra `public` pelada después de `search_path =`, no `'public'`
-- entrecomillado (ver supabase/README.md).
--
-- Errores nuevos: `COMPROBANTE_INVALIDO` (path fuera de la carpeta propia o
-- con forma de escape). El resto es igual que en 0057.
--
-- APLICADA y verificada en producción (schema `public`) el 2026-10-10.
-- Verificación por `pg_proc`, `information_schema.columns` y `pg_policies`:
-- una sola `informar_deposito_cuenta(medio_pago, bigint, date, text, text)`,
-- columna `imagen_path` nullable, y las policies
-- `storage_insert_coordinador_public` y `storage_select_coordinador_public`.
-- El bloque de verificación de solo lectura del final de este archivo sirve
-- para volver a chequearlo cuando haga falta.

-- ============================================================
-- 1) depositos_informados.imagen_path
-- ============================================================

alter table public.depositos_informados add column imagen_path text;

-- ============================================================
-- 2) informar_deposito_cuenta con comprobante (cambia la firma)
-- ============================================================

drop function public.informar_deposito_cuenta(medio_pago, bigint, date, text);

create function public.informar_deposito_cuenta(
  p_medio_pago medio_pago,
  p_monto_centavos bigint,
  p_fecha date default current_date,
  p_nota text default null,
  p_imagen_path text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenedor_id uuid;
  v_nombre text;
  v_en_mano numeric;
  v_deposito_informado_id uuid;
  v_imagen_path text;
  v_prefijo text;
begin
  if not public.es_coordinador() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_tenedor_id := public.mi_vendedor_id();
  select nombre into v_nombre from vendedores where id = v_tenedor_id;

  if p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  -- Comprobante (opcional a nivel base, ver cabecera): si viene, solo se
  -- acepta dentro de la carpeta propia de quien llama. Se compara contra
  -- `mi_vendedor_id()` (nunca contra un id que mande el cliente), así una
  -- coordinadora no puede apuntar a un archivo de otra persona ni a uno de
  -- `revendedores/`. `..` y `/` inicial no pueden escapar del bucket.
  v_imagen_path := nullif(btrim(p_imagen_path), '');
  if v_imagen_path is not null then
    v_prefijo := 'coordinadores/' || v_tenedor_id::text || '/';
    if left(v_imagen_path, length(v_prefijo)) <> v_prefijo
      or position('..' in v_imagen_path) > 0
      or left(v_imagen_path, 1) = '/'
    then
      raise exception 'COMPROBANTE_INVALIDO';
    end if;
  end if;

  -- Un aviso pendiente por vez (revisión adversarial de 0057): si ya hay uno
  -- esperando confirmación, avisar otro de nuevo dejaría el segundo
  -- trabado (v_plata_en_manos no descuenta lo ya avisado, así que el
  -- monto disponible de acá abajo estaría inflado). El índice único
  -- parcial `uq_depositos_informados_pendiente_por_tenedor` es la
  -- garantía real (cubre la carrera de dos avisos simultáneos); este
  -- chequeo es solo para devolver un error propio y claro.
  if exists (select 1 from depositos_informados where tenedor_id = v_tenedor_id and estado = 'pendiente') then
    raise exception 'AVISO_PENDIENTE';
  end if;

  -- No dejar avisar más de lo que tiene en mano ahora (mismo criterio que
  -- registrar_deposito_cuenta sin p_permitir_negativo): evita un aviso que
  -- después ningún admin puede confirmar sin dejarlo en negativo.
  select total_centavos into v_en_mano from v_plata_en_manos where tenedor_id = v_tenedor_id;
  if coalesce(v_en_mano, 0) - p_monto_centavos < 0 then
    raise exception 'SALDO_INSUFICIENTE'
      using detail = json_build_object('disponible', coalesce(v_en_mano, 0))::text;
  end if;

  insert into depositos_informados (tenedor_id, medio_pago, monto_centavos, fecha, nota, imagen_path)
  values (v_tenedor_id, p_medio_pago, p_monto_centavos, p_fecha, nullif(btrim(p_nota), ''), v_imagen_path)
  returning id into v_deposito_informado_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id, destinatario_id)
  values (
    'deposito_informado',
    'Depósito de ' || coalesce(v_nombre, 'un coordinador'),
    'Revisalo en Tareas para confirmarlo.',
    v_deposito_informado_id,
    null
  );

  return json_build_object('id', v_deposito_informado_id);
end;
$$;

revoke execute on function public.informar_deposito_cuenta(medio_pago, bigint, date, text, text) from anon, public;
grant execute on function public.informar_deposito_cuenta(medio_pago, bigint, date, text, text) to authenticated;

-- ============================================================
-- 3) Storage: la coordinadora sube y lee comprobantes de su carpeta
--    `coordinadores/<su vendedor_id>/...` (mismo molde que las de
--    revendedora de 0040, con `es_coordinador()` en vez de
--    `puede_revender()`). Los admins ya leen y escriben todo el bucket
--    (storage_*___SCHEMA__, 0013).
-- ============================================================

-- @solo-public:inicio
create policy storage_insert_coordinador___SCHEMA__ on storage.objects
  for insert to authenticated
  with check (
    bucket_id = '__BUCKET__'
    and __SCHEMA__.es_coordinador()
    and (storage.foldername(name))[1] = 'coordinadores'
    and (storage.foldername(name))[2] = __SCHEMA__.mi_vendedor_id()::text
  );

create policy storage_select_coordinador___SCHEMA__ on storage.objects
  for select to authenticated
  using (
    bucket_id = '__BUCKET__'
    and __SCHEMA__.es_coordinador()
    and (storage.foldername(name))[1] = 'coordinadores'
    and (storage.foldername(name))[2] = __SCHEMA__.mi_vendedor_id()::text
  );
-- @solo-public:fin

-- ============================================================
-- Verificación post-aplicación (SOLO LECTURA — correr en el SQL Editor):
--
--   -- a) la columna existe y es nullable
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'depositos_informados'
--     and column_name = 'imagen_path';
--   -- esperado: 1 fila, text, YES
--
--   -- b) UNA sola informar_deposito_cuenta, con 5 argumentos, security
--   --    definer y search_path = public
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'informar_deposito_cuenta';
--   -- esperado: 1 fila, firma
--   --   informar_deposito_cuenta(medio_pago,bigint,date,text,text),
--   --   prosecdef = true, proconfig = {search_path=public}
--
--   -- c) ACL: sin anon ni public, con authenticated
--   select p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'informar_deposito_cuenta';
--   -- esperado: el ACL NO tiene una entrada "=X/..." (public) ni "anon=X/...";
--   -- sí "authenticated=X/..." (y postgres / service_role)
--
--   -- d) policies de Storage nuevas (y las de siempre intactas)
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'storage_%'
--   order by policyname;
--   -- esperado: storage_insert_coordinador_public (INSERT),
--   --   storage_select_coordinador_public (SELECT), más
--   --   storage_insert_public, storage_select_public,
--   --   storage_insert_revendedor_public, storage_select_revendedor_public
-- ============================================================
