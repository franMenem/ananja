-- Ananja: adjuntar/quitar el comprobante (imagen_path) de un GASTO YA
-- EXISTENTE, solo para admins.
--
-- Por qué: `gastos.imagen_path` (0001) ya existe y el alta lo setea vía
-- `crear_gasto`, pero hoy no hay forma de agregarle o sacarle la foto/
-- factura a un gasto que ya quedó guardado (ej. se cargó el gasto sin
-- foto y la factura aparece después, o al revés: hace falta desvincularla
-- porque se subió una equivocada). Hoy la edición/borrado de un gasto ya
-- se hace con `.update()`/`.delete()` directos desde el cliente, permitidos
-- por las policies `gastos_update`/`gastos_delete` (0013) con
-- `using (es_vendedor())` — pero `es_vendedor()` es, desde 0018_revendedores.sql
-- (líneas 82-92), un alias puro de `es_admin()` (documentado también en
-- 0052:105-106, 0055:1153, 0060:32 y 0064:42), así que ese `.update()`
-- directo ya es admin-only hoy: no hay ningún agujero previo que estas RPCs
-- vengan a tapar. Lo que sí aportan es una acción explícita y acotada (solo
-- pisan/limpian `imagen_path`, no cualquier campo de la fila) — menor
-- privilegio que un `.update()` de fila completa — consistente con el resto
-- de las escrituras sensibles del repo (`crear_gasto`,
-- `registrar_compra_insumos_factura`, etc.), todas `es_admin()`-only.
--
-- `adjuntar_comprobante_gasto(p_gasto_id, p_imagen_path)`: pisa
-- `imagen_path` con el path ya subido a Storage (la subida en sí la hace
-- el cliente, autenticado, directo al bucket — ver `lib/storage.ts` /
-- `lib/foto-compra.ts` — esta RPC solo guarda la referencia). La
-- validación de PATH_INVALIDO es deliberadamente permisiva: rechaza vacío
-- y `..`/`/` inicial (para no permitir escapar del bucket ni paths
-- absolutos), pero no exige una forma exacta de carpetas — los paths
-- reales varían (`gastos/AAAA/MM/<uuid>.<ext>` para fotos de compra,
-- `AAAA/MM/<uuid>.<ext>` para comprobantes, `revendedores/<id>/...`, etc.,
-- ver `esPathStorageValido` en `lib/storage.ts`) y una regex más estricta
-- terminaría rechazando alguno de esos paths legítimos.
--
-- `quitar_comprobante_gasto(p_gasto_id)`: pone `imagen_path = null`, PERO
-- NO borra nada de Storage. Es a propósito: una misma factura puede
-- cubrir varios gastos (ej. una factura de etiquetas grandes cubre el
-- gasto de "grande frente" Y el de "grande retro", ambos con el mismo
-- `imagen_path`), así que borrar el archivo del bucket al desvincularlo de
-- UN gasto rompería la foto del otro. Si en algún momento hace falta
-- limpiar archivos huérfanos de Storage, es un proceso aparte que primero
-- confirme que ningún gasto (ni ninguna otra tabla que use el mismo
-- bucket) sigue referenciando ese path.
--
-- Migración sin templating (mismo criterio que 0049-0062): hardcodea
-- `public.` y `search_path = public` — Ananja es hoy el único negocio
-- activo (schema `miel` en pausa). Sin comillas a propósito: así
-- `supabase/render.mjs` puede reescribirlo al renderizar para `miel`
-- (su regex sólo matchea la palabra `public` pelada después de
-- `search_path =`/`search_path to`, no `'public'` entre comillas). Ver
-- supabase/README.md.
--
-- SIN APLICAR: queda para que Fran la aplique cuando decida (SQL Editor o
-- `supabase db push`, igual que 0063/0064/0065/0066 recientes).

-- ============================================================
-- 1) adjuntar_comprobante_gasto
-- ============================================================

create or replace function public.adjuntar_comprobante_gasto(
  p_gasto_id uuid,
  p_imagen_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto gastos%rowtype;
  v_path text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_gasto from gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'GASTO_NO_ENCONTRADO';
  end if;

  -- Validación de FORMA, permisiva: rechaza vacío y cualquier intento de
  -- escapar del bucket (`..`) o de path absoluto (`/...`). No exige una
  -- estructura de carpetas exacta — ver comentario de cabecera.
  v_path := nullif(btrim(p_imagen_path), '');
  if v_path is null
    or position('..' in v_path) > 0
    or left(v_path, 1) = '/'
  then
    raise exception 'PATH_INVALIDO';
  end if;

  update gastos set imagen_path = v_path where id = p_gasto_id;

  return json_build_object('ok', true, 'gasto_id', p_gasto_id, 'imagen_path', v_path);
end;
$$;

revoke execute on function public.adjuntar_comprobante_gasto(uuid, text) from anon, public;
grant execute on function public.adjuntar_comprobante_gasto(uuid, text) to authenticated;

-- ============================================================
-- 2) quitar_comprobante_gasto
-- ============================================================

create or replace function public.quitar_comprobante_gasto(
  p_gasto_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto gastos%rowtype;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_gasto from gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'GASTO_NO_ENCONTRADO';
  end if;

  -- NO borra nada de Storage: el mismo archivo puede estar compartido por
  -- varios gastos (ej. una factura de etiquetas grande frente + grande
  -- retro), así que borrar el archivo acá rompería la foto del otro gasto.
  -- Ver comentario de cabecera.
  update gastos set imagen_path = null where id = p_gasto_id;

  return json_build_object('ok', true, 'gasto_id', p_gasto_id, 'imagen_path', null);
end;
$$;

revoke execute on function public.quitar_comprobante_gasto(uuid) from anon, public;
grant execute on function public.quitar_comprobante_gasto(uuid) to authenticated;
