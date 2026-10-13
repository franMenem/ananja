-- Ananja: `informar_pago_revendedor` rechaza paths de comprobante con
-- segmentos de directorio padre (`..`, `%2e`, o `.` partido por TAB/LF/CR).
--
-- Por qué: la revendedora (o un admin desde su espacio de revendedor) manda
-- `p_imagen_path` al avisar un pago. Desde 0040 la función solo chequeaba que
-- el valor EMPEZARA con `revendedores/<mi_vendedor_id>/` — un prefijo, nada
-- más. Un valor como `revendedores/<mi_id>/../../otra/carpeta/archivo.jpg`
-- conserva el prefijo, así que se aceptaba y se guardaba tal cual en
-- `pagos_revendedor.imagen_path`. Después, cuando un admin abre ese pago en
-- Tareas (`app/(app)/tareas/pagos/[id]/page.tsx` -> `getSignedUrl` en
-- `lib/storage.ts`), el path guardado se arma SIN codificar en la URL de
-- `createSignedUrl` con la sesión del admin (que puede leer todo el bucket):
-- el parser de URL (WHATWG) normaliza los segmentos `..` y el "comprobante"
-- del pago termina siendo un archivo FUERA de la carpeta de la revendedora. La
-- confinación a `revendedores/<id>/` que esta validación quiere garantizar no
-- se cumplía.
--
-- Las funciones hermanas ya hacen este chequeo y esta era la que faltaba:
-- `informar_deposito_cuenta` (0071) y `adjuntar_comprobante_gasto` (0067)
-- rechazan un path que contenga `..` o empiece con `/`.
--
-- Qué hace esta migración (UNA sola cosa): redefine `informar_pago_revendedor`
-- con `create or replace` (la firma NO cambia, así que no se crea una
-- sobrecarga ni hay que hacer `drop function`; mismo patrón que 0055 6b y que
-- 0067). El cuerpo es el de 0055 sección 6b TEXTUAL (es la definición vigente:
-- verificado que ninguna migración 0056-0073 la redefine — 0057 y 0071 solo la
-- nombran en comentarios), con los mismos chequeos, los mismos errores
-- (`NO_AUTORIZADO`, `MONTO_INVALIDO`, `MEDIO_INVALIDO`, `FECHA_INVALIDA`,
-- `COMPROBANTE_REQUERIDO`, `COMPROBANTE_INVALIDO`), el mismo destinatario
-- (admin o coordinador activo), la misma notificación, el mismo `json` de
-- retorno y los mismos grants/revokes. Lo único que cambia es la condición de
-- `COMPROBANTE_INVALIDO`, que ahora además salta si el path:
--   - contiene `..` (igual que 0067 y 0071). Este chequeo de subcadena es el
--     que también deja inofensivos el `\` (para el parser de URL de https es
--     un separador de segmento: `..\..\x` ya contiene `..`), el descarte de
--     espacios/caracteres de control al final y el corte en `?`/`#`;
--   - empieza con `/` (igual que 0067 y 0071; con el prefijo
--     `revendedores/<id>/` ya exigido es imposible, se deja por paridad con
--     las hermanas y por si alguien cambia el prefijo algún día);
--   - contiene `%2e` en cualquier combinación de mayúsculas/minúsculas.
--     Esto va un paso más allá de las hermanas A PROPÓSITO: el parser de URL
--     (WHATWG) trata `%2e%2e` como un segmento `..`, así que con solo
--     rechazar `..` literal el mismo escape pasaba codificado;
--   - contiene TAB (chr(9)), LF (chr(10)) o CR (chr(13)). Esto también va un
--     paso más allá de las hermanas A PROPÓSITO: el parser de URL (WHATWG)
--     BORRA todo TAB/LF/CR de la entrada ANTES de separar los segmentos, así
--     que `.<TAB>.` o `%<TAB>2e` llegan al servidor como `..` / `%2e` aunque
--     la subcadena `..` o `%2e` no aparezca en lo guardado (`btrim` solo
--     recorta espacios, no estos caracteres). Se usa `chr(N)` y no una
--     cadena con escapes para que el chequeo no dependa de
--     `standard_conforming_strings`.
--   Todo es la misma idea (segmento de directorio padre), no una validación
--   nueva de forma.
--
-- Qué NO cambia (a propósito): sigue siendo una validación PERMISIVA de
-- forma. No se exige la estructura `revendedores/<uuid>/AAAA/MM/<uuid>.<ext>`
-- con una regex ni se consulta `storage.objects`: cualquiera de las dos podría
-- rechazar un path que la app mande legítimamente o haya mandado antes. Todo
-- path que arma el formulario (`components/mi/pago-form.tsx` ->
-- `subirComprobantePagoRevendedor` -> `revendedores/<vendedorId>/AAAA/MM/
-- <uuid>.<ext>`, con la extensión de una lista fija) sigue aceptándose igual
-- que antes: no tiene `..`, ni `%`, ni `/` inicial, ni TAB/LF/CR. Las filas
-- ya guardadas en `pagos_revendedor` no se tocan.
--
-- Cambio de comportamiento observable: SOLO se rechazan (con el mismo error
-- `COMPROBANTE_INVALIDO` que ya existía para "path fuera de la carpeta
-- propia") llamadas directas al RPC con `..`, `%2e`, `/` inicial, TAB, LF o CR
-- en el path; ningún cliente legítimo de la app puede mandar eso.
--
-- Numeración: 0075 y no 0074 porque otro parche pendiente de este repo también
-- agrega una migración 0074; `scripts/ci/check-migraciones.sh` solo avisa (no
-- falla) ante un hueco en la numeración, y sí falla ante números repetidos.
--
-- `set search_path = public` va SIN comillas a propósito (la definición de
-- 0055 lo tenía como `'public'`): `supabase/render.mjs` solo reescribe la
-- palabra `public` pelada después de `search_path =`, no `'public'`
-- entrecomillado (ver supabase/README.md). Es equivalente para Postgres.
--
-- `lib/types.ts` no cambia: la firma es la misma.
--
-- SIN APLICAR todavía. Después de aplicarla, el bloque de verificación de
-- solo lectura del final de este archivo sirve para chequearla.
--
-- Rollback (si hiciera falta): volver a correr la definición de
-- `informar_pago_revendedor` de la sección 6b de
-- `0055_coordinador.sql` (`create or replace`, misma firma). Los grants no
-- cambian en ninguno de los dos sentidos.

create or replace function public.informar_pago_revendedor(
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_imagen_path text default null::text,
  p_nota text default null::text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_nombre text;
  v_encargado_id uuid;
  v_destinatario_id uuid;
  v_imagen text;
  v_pago_id uuid;
begin
  if not public.puede_revender() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_vendedor_id := public.mi_vendedor_id();

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  select nombre, encargado_id into v_nombre, v_encargado_id
  from vendedores where id = v_vendedor_id;

  select id into v_destinatario_id
  from vendedores where id = v_encargado_id and rol in ('admin', 'coordinador') and activo;

  if v_destinatario_id is null and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_imagen := nullif(btrim(p_imagen_path), '');

  if v_imagen is null and p_medio_pago <> 'efectivo' then
    raise exception 'COMPROBANTE_REQUERIDO';
  end if;

  -- Solo se acepta dentro de la carpeta propia de quien llama (se compara
  -- contra `mi_vendedor_id()`, nunca contra un id que mande el cliente) y sin
  -- ninguna forma de segmento de directorio padre: `..` literal, `%2e`
  -- codificado (la URL de Storage se arma con este valor sin codificar y el
  -- parser de URL colapsa también `%2e%2e`), `/` inicial, ni TAB/LF/CR (el
  -- parser de URL los borra antes de separar segmentos, así que `.<TAB>.`
  -- llegaría como `..` sin contener esa subcadena; `btrim` solo recorta
  -- espacios). `chr(N)` y no escapes de cadena, para no depender de
  -- `standard_conforming_strings`.
  if v_imagen is not null
    and (
      left(v_imagen, length('revendedores/' || v_vendedor_id::text || '/'))
        <> 'revendedores/' || v_vendedor_id::text || '/'
      or position('..' in v_imagen) > 0
      or position('%2e' in lower(v_imagen)) > 0
      or left(v_imagen, 1) = '/'
      or position(chr(9) in v_imagen) > 0
      or position(chr(10) in v_imagen) > 0
      or position(chr(13) in v_imagen) > 0
    )
  then
    raise exception 'COMPROBANTE_INVALIDO';
  end if;

  insert into pagos_revendedor (
    vendedor_id, destinatario_id, monto_centavos, medio_pago, fecha, imagen_path, nota
  ) values (
    v_vendedor_id, v_destinatario_id, p_monto_centavos, p_medio_pago, p_fecha, v_imagen,
    nullif(btrim(p_nota), '')
  ) returning id into v_pago_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id, destinatario_id)
  values (
    'pago_revendedor',
    'Pago de ' || v_nombre,
    'Revisalo en Tareas para confirmarlo.',
    v_pago_id,
    v_destinatario_id
  );

  return json_build_object('id', v_pago_id, 'destinatario_id', v_destinatario_id);
end;
$$;

revoke execute on function public.informar_pago_revendedor(bigint, medio_pago, date, text, text) from anon, public;
grant execute on function public.informar_pago_revendedor(bigint, medio_pago, date, text, text) to authenticated;

-- ============================================================
-- Verificación post-aplicación (SOLO LECTURA — correr en el SQL Editor):
--
--   -- a) UNA sola informar_pago_revendedor, con 5 argumentos, security
--   --    definer y search_path = public
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'informar_pago_revendedor';
--   -- esperado: 1 fila, firma
--   --   informar_pago_revendedor(bigint,medio_pago,date,text,text),
--   --   prosecdef = true, proconfig = {search_path=public}
--
--   -- b) ACL: sin anon ni public, con authenticated
--   select p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'informar_pago_revendedor';
--   -- esperado: el ACL NO tiene una entrada "=X/..." (public) ni "anon=X/...";
--   -- sí "authenticated=X/..." (y postgres / service_role)
--
--   -- c) la definición vigente trae el chequeo nuevo
--   select
--     pg_get_functiondef(p.oid) like '%position(''..'' in v_imagen)%' as rechaza_dos_puntos,
--     pg_get_functiondef(p.oid) like '%position(''%2e'' in lower(v_imagen))%' as rechaza_2e_codificado,
--     pg_get_functiondef(p.oid) like '%left(v_imagen, 1) = ''/''%' as rechaza_barra_inicial
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'informar_pago_revendedor';
--   -- esperado: true, true, true
--
--   -- d) las filas que ya existían no se tocaron: ningún comprobante de pago
--   --    de revendedora con ninguna de las formas que la función ahora
--   --    rechaza (`..`, `%2e` sin importar mayúsculas, TAB, LF, CR);
--   --    informativo, no lo cambia esta migración
--   select count(*) as con_formas_rechazadas
--   from public.pagos_revendedor
--   where position('..' in imagen_path) > 0
--      or position('%2e' in lower(imagen_path)) > 0
--      or position(chr(9) in imagen_path) > 0
--      or position(chr(10) in imagen_path) > 0
--      or position(chr(13) in imagen_path) > 0;
--   -- esperado: 0
-- ============================================================
