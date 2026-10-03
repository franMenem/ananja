-- RPCs de escritura que ningún código llama (UI de ferias retirada,
-- transferencias reemplazadas por depósitos): se les saca el execute.
-- cerrar_feria queda porque tests/invariantes.integration.test.ts la usa.

revoke execute on function __SCHEMA__.crear_feria(text, text, date, text, jsonb, boolean) from authenticated, anon;
revoke execute on function __SCHEMA__.reabrir_feria(uuid) from authenticated, anon;
revoke execute on function __SCHEMA__.registrar_transferencia_caja(medio_pago, medio_pago, bigint, date, text, boolean) from authenticated, anon;
