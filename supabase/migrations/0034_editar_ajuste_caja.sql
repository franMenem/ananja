-- Ananja/Germá: editar/eliminar ajustes_caja (solo fecha y nota; nunca el
-- monto ni el medio de pago)
--
-- Reporte del dueño: cargó un ajuste de saldo ("Cuenta principal",
-- mercado_pago) fechado a hoy por error de carga — quería la
-- fecha real en la que arrancó el negocio, no la fecha en la que lo cargó
-- al sistema. `0033_fecha_ajuste_caja.sql` ya agregó `fecha` (y el date
-- picker al crear), pero solo para ajustes NUEVOS: los `ajustes_caja`
-- existentes seguían siendo inmutables por diseño ("no se editan ni se
-- borran, se compensan con uno nuevo" — ver el comentario de
-- `crear_ajuste_caja` en `0007_vendedores_auth.sql`, la policy
-- `ajustes_caja_select` de `0003_rls_seeds.sql`/`0013_multi_negocio.sql`
-- que es la ÚNICA sobre esa tabla, y el `revoke all on ajustes_caja from
-- anon, authenticated, public` seguido de `grant select` únicamente —
-- 0 grants de update/delete directo).
--
-- Ese diseño hace sentido para corregir un MONTO/medio mal cargado
-- (compensarlo con un ajuste nuevo deja un rastro auditable), pero no
-- ayuda a corregir solo la FECHA de un ajuste que quedó bien de
-- monto/medio: "compensar con uno nuevo" no tiene sentido para una fecha
-- (dejaría dos filas donde debería haber una, y duplicaría el efecto sobre
-- el saldo). Este chunk agrega dos RPCs para cubrir ese caso sin abrir la
-- puerta a que el saldo se reescriba en silencio:
--
-- 1. `editar_ajuste_caja(p_ajuste_id, p_fecha, p_nota)`: actualiza SOLO
--    `fecha` y `nota`. A propósito NO recibe `p_monto_centavos` ni
--    `p_medio_pago` — esas dos columnas son las que `v_saldos_caja` suma
--    por `medio_pago` para calcular el saldo de cada caja
--    (0002_views_rpcs.sql), así que dejarlas fuera de este RPC es lo que
--    garantiza que "editar" nunca puede reescribir el saldo. Si el monto o
--    el medio están mal, corresponde `eliminar_ajuste_caja` + cargar uno
--    nuevo con `crear_ajuste_caja` — mismo criterio que ya usaba "se
--    compensa con uno nuevo", pero ahora reemplazando la fila en vez de
--    sumar una fila de compensación al lado de la incorrecta.
-- 2. `eliminar_ajuste_caja(p_ajuste_id)`: borra la fila entera (sin
--    "soft delete" — `ajustes_caja` no tiene columna `activo`/`eliminado_en`,
--    y no hay otra tabla que referencie `ajustes_caja.id` por FK). Es la
--    única forma de corregir un monto/medio equivocado.
--
-- Ambas RPCs exigen `es_admin()` primero (mismo criterio que el resto de
-- RPCs de alta sobre esta tabla desde 0022_rpcs_solo_admin.sql), y
-- reutilizan las validaciones de `crear_ajuste_caja`: `NOTA_REQUERIDA`
-- (nota vacía o solo espacios) y, nueva acá porque antes no hacía falta,
-- `AJUSTE_INVALIDO` si `p_ajuste_id` no existe (mismo criterio que
-- `PAGO_NO_ENCONTRADO`/`VENTA_NO_ENCONTRADA` en 0027/0020). La policy
-- `ajustes_caja_select` y los grants de RLS quedan intactos: ni update ni
-- delete directo quedan habilitados por REST, todo sigue pasando por RPCs
-- `security definer`.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public: nada de esta migración es específica de un
-- negocio.

-- ============================================================
-- 1) editar_ajuste_caja — admin. Solo fecha y nota.
-- ============================================================

create function editar_ajuste_caja(
  p_ajuste_id uuid,
  p_fecha date,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_existe boolean;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select exists(select 1 from ajustes_caja where id = p_ajuste_id) into v_existe;
  if not v_existe then
    raise exception 'AJUSTE_INVALIDO';
  end if;

  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'NOTA_REQUERIDA';
  end if;

  update ajustes_caja
  set fecha = p_fecha, nota = p_nota
  where id = p_ajuste_id;

  return json_build_object('ajuste_id', p_ajuste_id);
end;
$$;

revoke execute on function editar_ajuste_caja(uuid, date, text) from anon, public;
grant execute on function editar_ajuste_caja(uuid, date, text) to authenticated;

-- ============================================================
-- 2) eliminar_ajuste_caja — admin. Borra la fila entera (corrige monto/medio).
-- ============================================================

create function eliminar_ajuste_caja(p_ajuste_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_existe boolean;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select exists(select 1 from ajustes_caja where id = p_ajuste_id) into v_existe;
  if not v_existe then
    raise exception 'AJUSTE_INVALIDO';
  end if;

  delete from ajustes_caja where id = p_ajuste_id;

  return json_build_object('ajuste_id', p_ajuste_id);
end;
$$;

revoke execute on function eliminar_ajuste_caja(uuid) from anon, public;
grant execute on function eliminar_ajuste_caja(uuid) to authenticated;
