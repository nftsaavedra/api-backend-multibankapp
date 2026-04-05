import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CorteCaja, TipoCorte, EstadoConciliacion } from '@prisma/client';
import { DateTime } from 'luxon';

const TIMEZONE = 'America/Lima';

export interface CreateCorteDto {
  tipoCorte: TipoCorte;
  saldoEfectivoDeclarado: number;
  saldoDigitalDeclarado: number;
  excedenteComision: number;
  operacionesKasnet: number;
  fechaInicioBloque?: Date;
}

export interface FindCortesFilters {
  operadorId?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

export interface CorteResult {
  corte: CorteCaja;
  movimientosSellados: number;
}

@Injectable()
export class CortesCajaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: FindCortesFilters): Promise<CorteCaja[]> {
    const where: Record<string, unknown> = {};

    if (filters?.operadorId) {
      where.operador_id = filters.operadorId;
    }
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fecha_corte_ejecucion = {};
      if (filters.fechaDesde) {
        (where.fecha_corte_ejecucion as Record<string, Date>).gte = filters.fechaDesde;
      }
      if (filters.fechaHasta) {
        (where.fecha_corte_ejecucion as Record<string, Date>).lte = filters.fechaHasta;
      }
    }

    return this.prisma.corteCaja.findMany({
      where,
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  async findById(id: string): Promise<CorteCaja> {
    const corte = await this.prisma.corteCaja.findUnique({
      where: { id },
    });
    if (!corte) {
      throw new NotFoundException('Corte de caja no encontrado');
    }
    return corte;
  }

  async findUltimoCortePorOperador(operadorId: string): Promise<CorteCaja | null> {
    return this.prisma.corteCaja.findFirst({
      where: { operador_id: operadorId },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  async create(dto: CreateCorteDto, operadorId: string): Promise<CorteResult> {
    const fechaInicioBloque =
      dto.fechaInicioBloque || DateTime.now().setZone(TIMEZONE).toJSDate();

    return this.prisma.$transaction(async (tx) => {
      const corte = await tx.corteCaja.create({
        data: {
          operador_id: operadorId,
          tipo_corte: dto.tipoCorte,
          fecha_inicio_bloque: fechaInicioBloque,
          saldo_efectivo_declarado: dto.saldoEfectivoDeclarado,
          saldo_digital_declarado: dto.saldoDigitalDeclarado,
          excedente_comision: dto.excedenteComision,
          operaciones_kasnet: dto.operacionesKasnet,
        },
      });

      const updateResult = await tx.movimientoAdministrativo.updateMany({
        where: {
          operador_id: operadorId,
          estado_conciliacion: EstadoConciliacion.NO_CONCILIADO,
        },
        data: {
          corte_id: corte.id,
          estado_conciliacion: EstadoConciliacion.CONCILIADO,
        },
      });

      return {
        corte,
        movimientosSellados: updateResult.count,
      };
    });
  }
}
