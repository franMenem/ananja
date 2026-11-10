-- 0082_cerrar_escrituras_directas.sql
--
-- Cierra dos huecos que dejó la auditoría de lectura, sin cambiar firmas ni
-- pantallas:
--
--   1) Escrituras directas por REST (rol `authenticated`) a la feria VIEJA
--      (`ferias`, `feria_productos`), que la app ya no usa.
--   2) `feria_quitar_participante` no tomaba lock de la feria ni validaba que
--      estuviera abierta: ahora exige feria abierta (`FERIA_CERRADA`).
--
-- Se aplica en UNA sola transacción. Todo es idempotente (revoke) o
-- `create or replace` con la misma firma.
--
-- ── 1) Qué grants se cierran y cuáles NO ────────────────────────────────
-- Toda la base dice "solo un admin activo" (`es_vendedor()` es alias de
-- `es_admin()` desde 0018), así que no son agujeros para terceros: el
-- objetivo es que el estado solo cambie por RPC que validan. Para cada
-- grant se buscó, en app/, components/ y lib/, toda escritura directa con el
-- cliente de usuario (`.from("<tabla>").insert|update|upsert|delete(`; no hay
-- helpers que reciban el nombre de tabla por parámetro) y se distinguió del
-- service role (`createAdminClient`, que no depende de estos grants y solo
-- se usa en invitaciones, cambio de contraseña y keep-alive: ninguna de esas
-- rutas toca estas tablas). Resultado (grants verificados contra prod):
--
--   tabla / grant                         ¿la app lo usa?                         decisión
--   deudas  insert + update(saldada_en)   SÍ: lib/precios.ts `crearDeuda` y       NO se toca
--                                         `marcarDeudaSaldada` (REST directo,
--                                         desde components/caja/deuda-form.tsx y
--                                         marcar-saldada-button.tsx)
--   movimientos_stock  insert             SÍ: components/stock/movimiento-form.tsx NO se toca
--                                         (egreso manual: merma/regalo/etc.)
--   gastos  update, delete (sin columnas) SÍ: app/(app)/gastos/[id]/page.tsx     NO se toca
--                                         (editar monto/categoría/medio/fecha/
--                                         nota y eliminar)
--   comprobantes  delete                  SÍ: components/comprobante-delete-button NO se toca
--   insumos  update(umbral_minimo, ...)   SÍ: lib/insumos.ts                      NO se toca
--                                         `actualizarUmbralInsumo` (solo
--                                         umbral_minimo; nombre/activo no se usan)
--   ferias  delete + update(5 columnas)   NO: ningún `.from("ferias")` en app/,    SE REVOCA
--                                         components/ ni lib/ (la feria vigente
--                                         es `feria_revendedoras`, vía RPC)
--   feria_productos  update(2 columnas)   NO: ningún `.from("feria_productos")`    SE REVOCA
--
-- Propuestas (SIN implementar acá; cada una exige cambiar código y tipos):
--   * deudas: `crear_deuda(...)` y `marcar_deuda_saldada(p_deuda_id, p_fecha)`
--     (security definer, `es_admin()`, fecha como parámetro por el tema UTC de
--     0036; que reabra/valide contra `v_saldo_deuda`). Hoy `marcarDeudaSaldada`
--     usa la fecha del navegador. Después: `revoke insert, update (saldada_en)`.
--   * movimientos_stock: `registrar_egreso_manual(...)` que valide stock (hoy
--     el trigger de stock del egreso es la única red).
--   * gastos: `editar_gasto(...)` / `eliminar_gasto(...)` que validen (por
--     ejemplo gastos ligados a un pago de pedido: ver comentario de 0044) y,
--     mínimo, achicar el `update` a las columnas que la pantalla edita
--     (monto_centavos, categoria_id, medio_pago, fecha, nota) en vez de todas.
--   * comprobantes: `eliminar_comprobante(p_id)` (ya existe `eliminar_*` para
--     movimientos y ventas de revendedor).
--   * insumos: `grant update (umbral_minimo)` solamente (hoy también nombre y
--     activo, que ninguna pantalla escribe por REST).
--
-- Lo que se revoca es el PRIVILEGIO (patrón de 0035 sobre `vendedores`); las
-- policies `ferias_update`, `ferias_delete` y `feria_productos_update` se
-- dejan: sin grant no se usan y quitarlas no agrega nada. `select` NO se toca:
-- las vistas `v_feria_*` son `security_invoker` y lo necesitan.
--
-- Interacción con la 0083 (retiro de la feria vieja): la 0083 conserva la
-- tabla `ferias` (la referencian por FK `comprobantes`, `gastos` y
-- `movimientos_stock`), así que el revoke sobre `ferias` sigue siendo
-- necesario. `feria_productos` sí se dropea en la 0083; revocar acá su update
-- es redundante si la 0083 se aplica, pero deja la 0082 segura por sí sola si
-- el dueño no aprueba la 0083. Orden recomendado: 0082 → 0083; igual la 0082
-- ya no falla en el orden inverso (el revoke sobre `feria_productos` está
-- protegido con `to_regclass` y se saltea si la tabla ya no existe).
--
-- ── 2) feria_quitar_participante ────────────────────────────────────────
-- Definición vigente: 0079 §6 (la 0078 la creó). Solo exigía `es_admin()` y
-- que no hubiera entregas, ventas ni degustaciones. No miraba el estado de la
-- feria: se podía quitar un participante de una feria cerrada, y no tomaba
-- lock, así que corría en carrera con `feria_cerrar` / `feria_cargar_degustacion`.
-- Ahora, igual que las demás RPC de feria (0078/0079), con el orden de locks
-- "feria -> participante": toma `for share` la feria, exige `abierta`
-- (`FERIA_NO_ENCONTRADA` / `FERIA_CERRADA`, los mismos códigos) y bloquea la
-- fila del participante `for update` antes de mirar sus movimientos y borrar.
-- Misma firma, `security definer`, `set search_path = public`, chequeo de rol
-- y grants (se repiten). UI: components/ferias/participante-feria.tsx solo
-- ofrece "Quitar" con la feria abierta (`feriaAbierta`) y muestra el error con
-- `mensajeErrorFeria`, que ya traduce `FERIA_CERRADA` y
-- `FERIA_NO_ENCONTRADA` (lib/dominio/feria.ts `ERRORES_FERIA`): no hace falta
-- tocar código.
--
-- Efecto del cambio: quitar de una feria cerrada ahora falla (antes
-- funcionaba si el participante no tenía movimientos). Una feria cerrada ya
-- no admite cambios de participantes, igual que el resto de las RPC.
--
-- ============================================================
-- Verificación (solo lectura; correr DESPUÉS de aplicar)
-- ============================================================
--
--   -- Esperado: ferias solo SELECT; feria_productos solo SELECT.
--   select table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'authenticated'
--     and table_name in ('ferias', 'feria_productos');
--   -- Esperado: 0 filas (ninguna columna con UPDATE para esas dos tablas).
--   select table_name, column_name from information_schema.column_privileges
--   where table_schema = 'public' and grantee = 'authenticated'
--     and privilege_type = 'UPDATE' and table_name in ('ferias', 'feria_productos');
--   -- Sin cambios (siguen en uso): deudas, movimientos_stock, gastos,
--   -- comprobantes, insumos.
--   -- La función quedó con la lógica nueva y los mismos permisos:
--   select position('FERIA_CERRADA' in prosrc) > 0 as exige_abierta, prosecdef
--   from pg_proc where oid = 'public.feria_quitar_participante(uuid, uuid)'::regprocedure; -- true, true
--   select has_function_privilege('authenticated',
--     'public.feria_quitar_participante(uuid, uuid)', 'execute'); -- true
--   select has_function_privilege('anon',
--     'public.feria_quitar_participante(uuid, uuid)', 'execute'); -- false
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   grant delete on public.ferias to authenticated;
--   grant update (nombre, lugar, fecha_inicio, fecha_fin, nota) on public.ferias to authenticated;   -- 0011_ferias.sql
--   grant update (precio_centavos, cantidad_llevada) on public.feria_productos to authenticated;      -- 0011_ferias.sql
--   -- feria_quitar_participante: volver al cuerpo de 0079 §6 (create or replace).

-- ============================================================
-- 1) Feria vieja: sin escrituras directas
-- ============================================================

revoke delete on public.ferias from authenticated;
revoke update (nombre, lugar, fecha_inicio, fecha_fin, nota) on public.ferias from authenticated;
do $$ begin
  if to_regclass('public.feria_productos') is not null then
    revoke update (precio_centavos, cantidad_llevada) on public.feria_productos from authenticated;
  end if;
end $$;

-- ============================================================
-- 2) feria_quitar_participante — exige feria abierta y toma locks
-- ============================================================

create or replace function public.feria_quitar_participante(p_feria_id uuid, p_vendedor_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feria_estado text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- Orden de locks: feria -> participante (igual que feria_cargar_degustacion).
  select estado into v_feria_estado
  from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  perform 1 from feria_participantes
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  for update;

  if exists (
    select 1 from entregas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) or exists (
    select 1 from ventas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) or exists (
    select 1 from feria_degustaciones
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) then
    raise exception 'PARTICIPANTE_CON_MOVIMIENTOS';
  end if;

  delete from feria_participantes where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.feria_quitar_participante(uuid, uuid) from anon, public;
grant execute on function public.feria_quitar_participante(uuid, uuid) to authenticated;
