import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  MovimientoAdministrativo,
  EstadoMovimiento,
  EstadoConciliacion,
} from '@prisma/client';
import type { CreateMovimientoDto } from './dto';
import type { FindMovimientosFiltersDto } from './dto';
import { MovementValidatorService } from './movement-validator.service';

@Injectable()
export class MovimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movementValidator: MovementValidatorService,
  ) {}

  async findAll(
    filters?: FindMovimientosFiltersDto,
  ): Promise<MovimientoAdministrativo[]> {
    const where: Record<string, unknown> = {};

    if (filters?.operadorId) {
      where.operador_id = filters.operadorId;
    }
    if (filters?.corteId) {
      where.corte_id = filters.corteId;
    }
    if (filters?.estadoConciliacion) {
      where.estado_conciliacion = filters.estadoConciliacion;
    }
    if (filters?.estadoAprobacion) {
      where.estado_aprobacion = filters.estadoAprobacion;
    }
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fecha_registro = {};
      if (filters.fechaDesde) {
        (where.fecha_registro as Record<string, Date>).gte = filters.fechaDesde;
      }
      if (filters.fechaHasta) {
        (where.fecha_registro as Record<string, Date>).lte = filters.fechaHasta;
      }
    }

    return this.prisma.movimientoAdministrativo.findMany({
      where,
      orderBy: { fecha_registro: 'desc' },
    });
  }

  async findById(id: string): Promise<MovimientoAdministrativo> {
    const movimiento = await this.prisma.movimientoAdministrativo.findUnique({
      where: { id },
    });
    if (!movimiento) {
      throw new NotFoundException('Movimiento no encontrado');
    }
    return movimiento;
  }

  async findBySyncId(syncId: string): Promise<MovimientoAdministrativo | null> {
    return this.prisma.movimientoAdministrativo.findUnique({
      where: { sync_id: syncId },
    });
  }

  async create(
    dto: CreateMovimientoDto,
    operadorId: string,
  ): Promise<MovimientoAdministrativo> {
    // Validar monto
    if (dto.monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    const estadoAprobacion = dto.esGasto
      ? EstadoMovimiento.PENDIENTE
      : EstadoMovimiento.APROBADO;

    return this.prisma.$transaction(async (tx) => {
      if (dto.esGasto) {
        return this.createEgreso(tx, dto, operadorId, estadoAprobacion);
      } else {
        return this.createIngreso(tx, dto, operadorId, estadoAprobacion);
      }
    });
  }

  /**
   * Crea un movimiento de egreso (gasto) con validación y descuento de saldo
   */
  private async createEgreso(
    tx: any,
    dto: CreateMovimientoDto,
    operadorId: string,
    estadoAprobacion: EstadoMovimiento,
  ): Promise<MovimientoAdministrativo> {
    // Validar cuenta origen obligatoria para egresos
    if (!dto.cuentaOrigenId) {
      throw new BadRequestException('Para egresos, la cuenta origen es obligatoria');
    }

    // Validar y bloquear cuenta origen
    await this.movementValidator.validateAndLockAccount(
      tx,
      dto.cuentaOrigenId,
      dto.monto,
      'origin',
    );

    // Descontar saldo de origen
    await tx.entidadFinanciera.update({
      where: { id: dto.cuentaOrigenId },
      data: { saldo_actual: { decrement: dto.monto } },
    });

    // Crear movimiento
    return tx.movimientoAdministrativo.create({
      data: {
        operador_id: operadorId,
        concepto: dto.concepto,
        monto: dto.monto,
        estado_aprobacion: estadoAprobacion,
        estado_conciliacion: EstadoConciliacion.NO_CONCILIADO,
        cuenta_origen_id: dto.cuentaOrigenId,
        cuenta_destino_id: dto.cuentaDestinoId || dto.cuentaOrigenId,
        sync_id: dto.syncId || null,
      },
    });
  }

  /**
   * Crea un movimiento de ingreso con validación y suma de saldo
   */
  private async createIngreso(
    tx: any,
    dto: CreateMovimientoDto,
    operadorId: string,
    estadoAprobacion: EstadoMovimiento,
  ): Promise<MovimientoAdministrativo> {
    // Validar cuenta destino obligatoria para ingresos
    if (!dto.cuentaDestinoId) {
      throw new BadRequestException('Para ingresos, la cuenta destino es obligatoria');
    }

    // Validar y bloquear cuenta destino
    await this.movementValidator.validateAndLockAccount(
      tx,
      dto.cuentaDestinoId,
      0,
      'destination',
    );

    // Sumar saldo a destino
    await tx.entidadFinanciera.update({
      where: { id: dto.cuentaDestinoId },
      data: { saldo_actual: { increment: dto.monto } },
    });

    // Crear movimiento
    return tx.movimientoAdministrativo.create({
      data: {
        operador_id: operadorId,
        concepto: dto.concepto,
        monto: dto.monto,
        estado_aprobacion: estadoAprobacion,
        estado_conciliacion: EstadoConciliacion.NO_CONCILIADO,
        cuenta_origen_id: dto.cuentaOrigenId ? dto.cuentaOrigenId : undefined,
        cuenta_destino_id: dto.cuentaDestinoId,
        sync_id: dto.syncId || null,
      },
    });
  }

  async aprobar(
    id: string,
    aprobadorId: string,
  ): Promise<MovimientoAdministrativo> {
    const movimiento = await this.findById(id);

    if (movimiento.estado_aprobacion !== EstadoMovimiento.PENDIENTE) {
      throw new BadRequestException(
        'El movimiento no está pendiente de aprobación',
      );
    }

    return this.prisma.movimientoAdministrativo.update({
      where: { id },
      data: {
        estado_aprobacion: EstadoMovimiento.APROBADO,
        aprobado_por: aprobadorId,
      },
    });
  }

  async rechazar(id: string): Promise<MovimientoAdministrativo> {
    const movimiento = await this.findById(id);

    if (movimiento.estado_aprobacion !== EstadoMovimiento.PENDIENTE) {
      throw new BadRequestException(
        'El movimiento no está pendiente de aprobación',
      );
    }

    return this.prisma.movimientoAdministrativo.update({
      where: { id },
      data: {
        estado_aprobacion: EstadoMovimiento.RECHAZADO,
      },
    });
  }
}
