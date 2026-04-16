/**
 * Tipos para transacciones de Prisma
 * Uso: pasar tx: TransactionClient como parámetro en métodos de transacción
 */
import { PrismaClient } from '@prisma/client';

export type TransactionClient = Omit<
  PrismaClient,
  | '$connect'
  | '$disconnect'
  | '$on'
  | '$transaction'
  | '$use'
  | '$extends'
>;

// Helper para tipar el callback de $transaction
export type TransactionCallback<T> = (
  tx: TransactionClient,
) => Promise<T>;
