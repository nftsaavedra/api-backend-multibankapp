import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface AccountWithBalance {
  id: string;
  saldo_actual: Prisma.Decimal | number;
}

@Injectable()
export class BalanceAdjusterService {
  /**
   * Adjusts account balances proportionally based on their current balances
   * Uses the "largest account gets remainder" technique to avoid rounding errors
   * 
   * @param tx - Prisma transaction client
   * @param accounts - Array of accounts to adjust
   * @param totalDifference - Total amount to distribute (positive or negative)
   */
  async adjustProportionally(
    tx: Prisma.TransactionClient,
    accounts: AccountWithBalance[],
    totalDifference: number,
  ): Promise<void> {
    // Early exit if no accounts or negligible difference
    if (accounts.length === 0 || Math.abs(totalDifference) < 0.01) {
      return;
    }

    // Calculate total balance across all accounts
    const totalSaldo = accounts.reduce(
      (sum, acc) => sum + Number(acc.saldo_actual),
      0,
    );

    // If all accounts have zero balance, distribute equally
    if (totalSaldo === 0) {
      const equalShare = totalDifference / accounts.length;
      for (const account of accounts) {
        await tx.entidadFinanciera.update({
          where: { id: account.id },
          data: { saldo_actual: { increment: equalShare } },
        });
      }
      return;
    }

    // Distribute proportionally, with last account getting the remainder
    // to avoid floating-point rounding errors
    let remainingDifference = totalDifference;
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const proportion = Number(account.saldo_actual) / totalSaldo;
      
      // Last account gets the remainder to ensure exact distribution
      const adjustment =
        i === accounts.length - 1
          ? remainingDifference
          : totalDifference * proportion;

      await tx.entidadFinanciera.update({
        where: { id: account.id },
        data: { saldo_actual: { increment: adjustment } },
      });

      remainingDifference -= adjustment;
    }
  }
}
