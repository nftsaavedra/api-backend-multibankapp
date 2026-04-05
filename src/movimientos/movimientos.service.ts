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
  RolUsuario,
} from '@prisma/client';

export interface CreateMovimientoDto {
  concepto: string;
  monto: number;
  esGasto?: boolean;
  cuentaOrigenId: string;
  cuentaDestinoId: string;
  syncId?: string;
}

export interface FindMovimientosFilters {
  operadorId?: string;
  corteId?: string;
  estadoConciliacion?: EstadoConciliacion;
  estadoAprobacion?: EstadoMovimiento;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

@Injectable()
export class MovimientosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: FindMovimientosFilters): Promise<MovimientoAdministrativo[]> {
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
    operadorRol: RolUsuario,
  ): Promise<MovimientoAdministrativo> {
    if (dto.cuentaOrigenId === dto.cuentaDestinoId) {
      throw new BadRequestException(
        'La cuenta origen y destino deben ser diferentes',
      );
    }

    const cuentaOrigen = await this.prisma.entidadFinanciera.findUnique({
      where: { id: dto.cuentaOrigenId },
    });
    const cuentaDestino = await this.prisma.entidadFinanciera.findUnique({
      where: { id: dto.cuentaDestinoId },
    });

    if (!cuentaOrigen || !cuentaOrigen.activo) {
      throw new BadRequestException('Cuenta origen no válida');
    }
    if (!cuentaDestino || !cuentaDestino.activo) {
      throw new BadRequestException('Cuenta destino no válida');
    }

    if (dto.monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    if (Number(cuentaOrigen.saldo_actual) < dto.monto) {
      throw new BadRequestException('Saldo insuficiente en cuenta origen');
    }

    const estadoAprobacion = dto.esGasto
      ? EstadoMovimiento.PENDIENTE
      : EstadoMovimiento.APROBADO;

    return this.prisma.$transaction(async (tx) => {
      const nuevoSaldoOrigen = Number(cuentaOrigen.saldo_actual) - dto.monto;
      const nuevoSaldoDestino = Number(cuentaDestino.saldo_actual) + dto.monto;

      await tx.entidadFinanciera.update({
        where: { id: dto.cuentaOrigenId },
        data: { saldo_actual: nuevoSaldoOrigen },
      });

      await tx.entidadFinanciera.update({
        where: { id: dto.cuentaDestinoId },
        data: { saldo_actual: nuevoSaldoDestino },
      });

      return tx.movimientoAdministrativo.create({
        data: {
          operador_id: operadorId,
          concepto: dto.concepto,
          monto: dto.monto,
          estado_aprobacion: estadoAprobacion,
          estado_conciliacion: EstadoConciliacion.NO_CONCILIADO,
          cuenta_origen_id: dto.cuentaOrigenId,
          cuenta_destino_id: dto.cuentaDestinoId,
          sync_id: dto.syncId || null,
        },
      });
    });
  }

  async aprobar(id: string, aprobadorId: string): Promise<MovimientoAdministrativo> {
    const movimiento = await this.findById(id);

    if (movimiento.estado_aprobacion !== EstadoMovimiento.PENDIENTE) {
      throw new BadRequestException('El movimiento no está pendiente de aprobación');
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
      throw new BadRequestException('El movimiento no está pendiente de aprobación');
    }

    return this.prisma.movimientoAdministrativo.update({
      where: { id },
      data: {
        estado_aprobacion: EstadoMovimiento.RECHAZADO,
      },
    });
  }
}
