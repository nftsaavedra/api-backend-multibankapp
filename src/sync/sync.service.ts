import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MovimientosService } from '../movimientos/movimientos.service';
import type { SyncBatchRequestDto, SyncMovimientoDto } from './dto';

export interface SyncSuccessResult {
  syncId: string;
  success: true;
}

export interface SyncRejectedResult {
  syncId: string;
  success: false;
  motivo: string;
}

export type SyncResult = SyncSuccessResult | SyncRejectedResult;

export interface SyncBatchResponse {
  procesados_exito: string[];
  rechazados: SyncRejectedResult[];
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

  async syncBatch(request: SyncBatchRequestDto): Promise<SyncBatchResponse> {
    const procesados_exito: string[] = [];
    const rechazados: SyncRejectedResult[] = [];

    // Procesar cada movimiento individualmente para aislar fallos
    // pero verificar idempotence antes de procesar
    for (const movimiento of request.movimientos) {
      try {
        // Verificar si ya existe (idempotence)
        const existing = await this.movimientosService.findBySyncId(
          movimiento.syncId,
        );
        if (existing) {
          this.logger.debug(
            `Movimiento ${movimiento.syncId} ya existe, marcando como éxito`,
          );
          procesados_exito.push(movimiento.syncId);
          continue;
        }

        // Intentar crear el movimiento
        await this.movimientosService.create(
          {
            concepto: movimiento.concepto,
            monto: movimiento.monto,
            esGasto: movimiento.esGasto,
            cuentaOrigenId: movimiento.cuentaOrigenId,
            cuentaDestinoId: movimiento.cuentaDestinoId,
            syncId: movimiento.syncId,
          },
          request.operadorId,
        );

        procesados_exito.push(movimiento.syncId);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(
          `Error procesando ${movimiento.syncId}: ${errorMessage}`,
        );

        rechazados.push({
          syncId: movimiento.syncId,
          success: false,
          motivo: errorMessage,
        });
      }
    }

    this.logger.log(
      `Sync batch completado: ${procesados_exito.length} procesados, ${rechazados.length} fallidos`,
    );

    return {
      procesados_exito,
      rechazados,
      totalProcessed: procesados_exito.length,
      totalFailed: rechazados.length,
    };
  }

  private async processSingleMovimiento(
    dto: SyncMovimientoDto,
    operadorId: string,
  ): Promise<SyncResult> {
    try {
      const existing = await this.movimientosService.findBySyncId(dto.syncId);

      if (existing) {
        this.logger.debug(
          `Movimiento con syncId ${dto.syncId} ya existe, ignorando`,
        );
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
      );

      return {
        syncId: dto.syncId,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error procesando movimiento ${dto.syncId}: ${errorMessage}`,
      );

      return {
        syncId: dto.syncId,
        success: false,
        motivo: errorMessage,
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
