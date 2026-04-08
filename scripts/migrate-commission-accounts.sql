-- ========================================
-- SCRIPT DE MIGRACIÓN: CORRECCIÓN DE CUENTAS DE COMISIÓN
-- ========================================
-- Propósito: Marcar cuentas de comisión para excluirlas de los cálculos de saldos del sistema
-- Fecha: 2026-04-08
-- ========================================

-- PASO 1: Identificar cuentas que parecen ser de comisión
SELECT 
  id,
  nombre,
  tipo,
  saldo_actual,
  activo,
  es_cuenta_comision
FROM entidades_financieras
WHERE 
  nombre ILIKE '%comisión%' OR 
  nombre ILIKE '%comision%' OR
  nombre ILIKE '%ingreso%' OR
  tipo ILIKE '%COMISION%' OR
  tipo ILIKE '%INGRESO%';

-- PASO 2: Marcar cuentas de comisión (REVISAR ANTES DE EJECUTAR)
-- Opción A: Marcar por nombre
UPDATE entidades_financieras 
SET es_cuenta_comision = true 
WHERE 
  nombre ILIKE '%comisión%' OR 
  nombre ILIKE '%comision%';

-- Opción B: Marcar por ID específico (más seguro)
-- UPDATE entidades_financieras 
-- SET es_cuenta_comision = true 
-- WHERE id = 'UUID_DE_LA_CUENTA_AQUI';

-- PASO 3: Verificar que se marcaron correctamente
SELECT 
  id,
  nombre,
  tipo,
  saldo_actual,
  es_cuenta_comision
FROM entidades_financieras
ORDER BY es_cuenta_comision DESC, nombre;

-- PASO 4 (OPCIONAL): Si la cuenta de comisión tiene saldo y quieres transferirlo
-- a la cuenta principal de efectivo antes de eliminarla:

-- 4a. Verificar el saldo actual de la cuenta de comisión
-- SELECT nombre, saldo_actual FROM entidades_financieras WHERE es_cuenta_comision = true;

-- 4b. Transferir saldo a cuenta principal (si es necesario)
-- UPDATE entidades_financieras 
-- SET saldo_actual = saldo_actual + (
--   SELECT saldo_actual FROM entidades_financieras WHERE nombre = 'Ingresos por Comisión (Física)'
-- )
-- WHERE nombre = 'Caja Principal';

-- 4c. Resetear saldo de cuenta de comisión a cero
-- UPDATE entidades_financieras 
-- SET saldo_actual = 0 
-- WHERE es_cuenta_comision = true;

-- PASO 5 (OPCIONAL): Eliminar cuentas de comisión (SOLO SI NO TIENEN MOVIMIENTOS)
-- Primero verificar movimientos asociados
-- SELECT COUNT(*) FROM movimientos_administrativos 
-- WHERE cuenta_origen_id IN (SELECT id FROM entidades_financieras WHERE es_cuenta_comision = true)
--    OR cuenta_destino_id IN (SELECT id FROM entidades_financieras WHERE es_cuenta_comision = true);

-- Si no hay movimientos o estás seguro, puedes eliminar:
-- DELETE FROM entidades_financieras WHERE es_cuenta_comision = true;

-- ========================================
-- NOTAS IMPORTANTES:
-- ========================================
-- 1. Las cuentas marcadas con es_cuenta_comision=true NO se incluirán en:
--    - Cálculo de saldo_efectivo_sistema
--    - Cálculo de saldo_digital_sistema
--    - Ajustes proporcionales de saldos
--
-- 2. Las comisiones ahora se registran automáticamente como movimientos
--    cuando se declara excedente_comision > 0 en un corte de caja
--
-- 3. El movimiento de comisión:
--    - Se crea con estado APROBADO y CONCILIADO
--    - Se vincula al corte de caja que lo generó
--    - Incrementa el saldo de la cuenta principal de efectivo
--
-- 4. Es seguro mantener cuentas de comisión con es_cuenta_comision=true
--    para trazabilidad histórica, pero no es obligatorio
-- ========================================
