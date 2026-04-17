import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class MovementValidatorService {

  /**
   * Validates that an account exists, is active, and has sufficient balance (if origin account)
   * @param tx - Prisma transaction client
   * @param accountId - The account ID to validate
   * @param requiredBalance - Minimum balance required (only checked for origin accounts)
   * @param accountType - Whether this is an origin or destination account
   * @returns The validated account entity
   */
  async validateAndLockAccount(
    tx: Prisma.TransactionClient,
    accountId: string,
    requiredBalance: number,
    accountType: 'origin' | 'destination',
  ): Promise<Prisma.EntidadFinancieraGetPayload<Record<string, never>>> {
    const account = await tx.entidadFinanciera.findUnique({
      where: { id: accountId },
    });

    if (!account || !account.activo) {
      throw new BadRequestException(
        accountType === 'origin'
          ? 'Cuenta origen no válida'
          : 'Cuenta destino no válida',
      );
    }

    if (
      accountType === 'origin' &&
      Number(account.saldo_actual) < requiredBalance
    ) {
      throw new BadRequestException('Saldo insuficiente en cuenta origen');
    }

    return account;
  }
}
