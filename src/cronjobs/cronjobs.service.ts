import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { EstadoMovimiento, EstadoConciliacion } from '@prisma/client';

export interface Anomalia {
  tipo: 'SALDO_NEGATIVO' | 'MOVIMIENTO_PENDIENTE_VIEJO' | 'DESCUADRE';
  descripcion: string;
  entidadId?: string;
  movimientoId?: string;
  detalles?: Record<string, unknown>;
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
}
