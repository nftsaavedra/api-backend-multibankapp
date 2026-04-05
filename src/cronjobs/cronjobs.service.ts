import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { EstadoMovimiento } from '@prisma/client';

export interface Anomalia {
  tipo: 'SALDO_NEGATIVO' | 'MOVIMIENTO_PENDIENTE_VIEJO' | 'DESCUADRE' | 'ANOMALIA_IA';
  descripcion: string;
  entidadId?: string;
  movimientoId?: string;
  corteId?: string;
  detalles?: Record<string, unknown>;
}

export interface VectorAnomalyResult {
  id: string;
  ia_fingerprint: string;
}

@Injectable()
export class CronjobsService {
  private readonly logger = new Logger(CronjobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async detectarAnomalias(): Promise<void> {
    this.logger.log('Iniciando detección de anomalías...');

    const anomalias: Anomalia[] = [];

    const saldosNegativos = await this.detectarSaldosNegativos();
    anomalias.push(...saldosNegativos);

    const movimientosViejos = await this.detectarMovimientosPendientesViejos();
    anomalias.push(...movimientosViejos);

    const anomaliasIA = await this.detectarAnomaliasVectoriales();
    anomalias.push(...anomaliasIA);

    if (anomalias.length > 0) {
      this.logger.warn(`Se detectaron ${anomalias.length} anomalías:`);
      for (const anomalia of anomalias) {
        this.logger.warn(`[${anomalia.tipo}] ${anomalia.descripcion}`);
      }
    } else {
      this.logger.log('No se detectaron anomalías');
    }
  }

  private async detectarSaldosNegativos(): Promise<Anomalia[]> {
    const entidades = await this.prisma.entidadFinanciera.findMany({
      where: { activo: true },
    });

    const anomalias: Anomalia[] = [];

    for (const entidad of entidades) {
      if (Number(entidad.saldo_actual) < 0) {
        anomalias.push({
          tipo: 'SALDO_NEGATIVO',
          descripcion: `Entidad ${entidad.nombre} tiene saldo negativo: ${entidad.saldo_actual}`,
          entidadId: entidad.id,
          detalles: { saldo: entidad.saldo_actual },
        });
      }
    }

    return anomalias;
  }

  private async detectarMovimientosPendientesViejos(): Promise<Anomalia[]> {
    const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const movimientos = await this.prisma.movimientoAdministrativo.findMany({
      where: {
        estado_aprobacion: EstadoMovimiento.PENDIENTE,
        fecha_registro: { lt: hace24Horas },
      },
    });

    return movimientos.map((mov) => ({
      tipo: 'MOVIMIENTO_PENDIENTE_VIEJO' as const,
      descripcion: `Movimiento pendiente de aprobación desde ${mov.fecha_registro}`,
      movimientoId: mov.id,
      detalles: {
        monto: mov.monto,
        concepto: mov.concepto,
        fechaRegistro: mov.fecha_registro,
      },
    }));
  }

  private async detectarAnomaliasVectoriales(): Promise<Anomalia[]> {
    try {
      const cortesConFingerprint = await this.prisma.$queryRaw<VectorAnomalyResult[]>`
        SELECT id, ia_fingerprint
        FROM "CorteCaja"
        WHERE ia_fingerprint IS NOT NULL
        ORDER BY fecha_corte_ejecucion DESC
        LIMIT 100
      `;

      if (cortesConFingerprint.length < 2) {
        return [];
      }

      const anomalias: Anomalia[] = [];
      const umbralAnomalia = 0.85;

      for (let i = 0; i < cortesConFingerprint.length; i++) {
        const corteActual = cortesConFingerprint[i];

        for (let j = i + 1; j < cortesConFingerprint.length; j++) {
          const corteComparacion = cortesConFingerprint[j];

          const distanceResult = await this.prisma.$queryRaw<{ distance: number }[]>`
            SELECT ${corteActual.ia_fingerprint}::vector <=> ${corteComparacion.ia_fingerprint}::vector AS distance
          `;

          const distance = distanceResult[0]?.distance ?? 1;

          if (distance > umbralAnomalia) {
            anomalias.push({
              tipo: 'ANOMALIA_IA',
              descripcion: `Corte ${corteActual.id} tiene patrón anómalo (distancia: ${distance.toFixed(4)})`,
              corteId: corteActual.id,
              detalles: {
                distance,
                corteComparadoId: corteComparacion.id,
                umbral: umbralAnomalia,
              },
            });
            break;
          }
        }
      }

      return anomalias;
    } catch (error) {
      this.logger.error('Error en detección de anomalías vectoriales:', error);
      return [];
    }
  }
}
