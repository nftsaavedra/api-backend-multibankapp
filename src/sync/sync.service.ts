import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import { RolUsuario } from '@prisma/client';
import type { CreateMovimientoDto } from '../movimientos/movimientos.service';

export interface SyncMovimientoDto extends CreateMovimientoDto {
  syncId: string;
  timestampOffline: Date;
}

export interface SyncBatchRequest {
  operadorId: string;
  movimientos: SyncMovimientoDto[];
}

export interface SyncResult {
  syncId: string;
  success: boolean;
  error?: string;
}

export interface SyncBatchResponse {
  results: SyncResult[];
  totalProcessed: number;
  totalFailed: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientosService: MovimientosService,
  ) {}

  async syncBatch(
    request: SyncBatchRequest,
    operadorRol: RolUsuario,
  ): Promise<SyncBatchResponse> {
    const results: SyncResult[] = [];
    let totalProcessed = 0;
    let totalFailed = 0;

    for (const movimiento of request.movimientos) {
      const result = await this.processSingleMovimiento(
        movimiento,
        request.operadorId,
        operadorRol,
      );
      results.push(result);

      if (result.success) {
        totalProcessed++;
      } else {
        totalFailed++;
      }
    }

    this.logger.log(
      `Sync batch completado: ${totalProcessed} procesados, ${totalFailed} fallidos`,
    );

    return {
      results,
      totalProcessed,
      totalFailed,
    };
  }

  private async processSingleMovimiento(
    dto: SyncMovimientoDto,
    operadorId: string,
    operadorRol: RolUsuario,
  ): Promise<SyncResult> {
    try {
      const existing = await this.movimientosService.findBySyncId(dto.syncId);

      if (existing) {
        this.logger.debug(`Movimiento con syncId ${dto.syncId} ya existe, ignorando`);
        return {
          syncId: dto.syncId,
          success: true,
        };
      }

      await this.movimientosService.create(
        {
          concepto: dto.concepto,
          monto: dto.monto,
          esGasto: dto.esGasto,
          cuentaOrigenId: dto.cuentaOrigenId,
          cuentaDestinoId: dto.cuentaDestinoId,
          syncId: dto.syncId,
        },
        operadorId,
        operadorRol,
      );

      return {
        syncId: dto.syncId,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error procesando movimiento ${dto.syncId}: ${errorMessage}`,
      );

      return {
        syncId: dto.syncId,
        success: false,
        error: errorMessage,
      };
    }
  }

  async getSyncStatus(syncIds: string[]): Promise<Record<string, boolean>> {
    const movimientos = await this.prisma.movimientoAdministrativo.findMany({
      where: {
        sync_id: { in: syncIds },
      },
      select: { sync_id: true },
    });

    const existingIds = new Set(movimientos.map((m) => m.sync_id));

    const status: Record<string, boolean> = {};
    for (const syncId of syncIds) {
      status[syncId] = existingIds.has(syncId);
    }

    return status;
  }
}
